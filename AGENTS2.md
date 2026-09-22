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

- **Production backend**: `https://yto-express-web-qjm3.onrender.com` on the owner's Render account (service `yto-express-web`, repo `Natoy0123/yto-express-web`, region Singapore — migrated 2026-09-22 from the previous `https://yto-express-backend.onrender.com` host), or `VITE_API_URL` when set — verified against `src/services/api.js` and `src/services/useSSE.js` defaults (2026-09-09). The older `https://yto-express.onrender.com` host name appears only in legacy comments.
- **Local dev backend**: `http://localhost:3001` (port **3001**, not 5001)
- Workspace: `C:\Users\ADMIN\React_Projects\YTO Latest\` — the Android side (`AGENTS.md`) references this project; do not confuse it with the stale internal mirror at `...\AndroidStudioProjects\YTO_Express_App\React_Projects\YTO Latest`.
- **Plain, non-technical terminology (GENERAL RULE)**: All user-facing text across the entire Web Admin platform — including dialogs, modals, alerts, toast notifications, table empty states, form validation errors, labels, tooltips, and action prompts — MUST strictly use clear, everyday, non-technical words. Never expose developer, system, network, or database jargon (e.g. avoid "configure", "credentials", "parameters", "null", "undefined", "payload", "socket", "token", "API", "endpoint", "database", "500", "backend", "exception", "failed to parse", "UUID", "syncing"). Use natural, user-friendly language (e.g., "details" / "information" instead of "credentials" / "parameters"; "add" / "enter" / "set up" instead of "configure"; "unable to load, please try again" instead of "API fetch error").

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
- Route keys are the contract (must stay identical to `PAGE_MAP`); display labels are free to change. Sidebar sub-labels are noun-based destinations: `process-seller`/`process-rider` show as **"Registration Review"**, `seller-report` → **"Seller Directory"**, `monitor-rider` → **"Duty Monitor"**, `rider-report` → **"Rider Reports"**, `manage-parcels` → **"All Parcels"**, `parcel-location` → **"Parcel Map"**, `geofence` → **"Geofence Monitor"**, `manage-issues` → **"Issues"**, `manage-accounts` → **"Accounts"**, `tracking-info` → **"Tracking Reports"** (moved under SHIPMENTS, out of the GPS group), `settings` → **"Archives"** (renamed 2026-09-18 — the page is archive management, not preferences; visible under ADMIN for super_admin only, plus the profile-dropdown "Archives" entry).
- Dashboard content order (2026-09-22 rewrite; supersedes the 2026-09-18 order, which no longer matched the code and is corrected here): the page reads top-down as logistics → people → support → system.
  1. Flat toolbar (title + date + shared `RefreshButton`).
  2. KPI row — `StatCard.Grid` with **exactly four** cards (Delivery Success, In Transit, Riders On Duty, Waiting For Review). Only Delivery Success carries a trend badge (its week-over-week comparison is the only honest one; parcels carry real dates).
  3. `ed-canvas-grid` — Parcel Volume (2.2fr, Daily/Weekly/Hourly switch, `CardFooter`) beside the Parcel Operations rail (1fr, the parcel-status composition ring + legend, with the View/PDF/CSV actions in its `CardFooter`).
  4. Rider Performance, full width — the ranked `DataTable` (Rider / Duty / Parcels / Delivered / Success / Rating) with its `CardFooter`. It is the only per-rider block on the page.
  5. `ed-people-row` — Seller Pipeline / Customer Growth / Support Snapshot, one row, hidden for `hub_receiver` (support and people are staff-only).
  6. `System Activity` `SectionCard` — last card on the page and the only place admin connections and `PeakAlertBanner` appear.
  Every panel is the shared `SectionCard`; no card chrome is declared in `AnalyticsDashboard.css`. Single-column stack below 1080px; `ed-people-row` uses `repeat(auto-fit, minmax(300px, 1fr))` so its three cards wrap without a breakpoint.
- **One chart type per data shape (2026-09-22)**: discrete periods (a named day, a named week) get the bar plot; a continuous run (14 hours, 14 days) gets `TrendArea` (area fill + line, one `<title>` per point, optional dashed reference line); a composition gets the status ring in Parcel Operations; an ordered set of stages keeps the Seller Pipeline funnel; the per-rider ranking is the `DataTable`, never a chart. One series carries one colour, and only a unique maximum is highlighted. The ring's slices are labelled data, so their whole-number shares are allocated by largest remainder and must total exactly 100 — rounding each slice on its own produced 101.
- **Removed from the dashboard (2026-09-22, owner-approved)**: the standalone `ConnectionHistoryChart` "Hourly Activity" card (the component file is deleted — hour granularity is the Parcel Volume card's third view, do not restore a second parcel-over-time chart), the "Rider Activity" bar chart (its per-rider counts are the leaderboard's Delivered column), the "Working Tabs" quick-link card (it duplicated the sidebar), and the Busiest/Peak footer pills whose values are already printed above every bar. Do not reintroduce a chart of a metric the page already charts elsewhere.
- **No duplicated figures (2026-09-22)**: each number renders once, in the section that owns it. The removed repeats were delivery success (hero + hero breakdown + hero sub + operations rail), riders on duty (KPI + rail stat + activity footer), customer counts (KPI + growth block head + two rail stats) and the return rate (rail stat + micro-chart head). Seller/customer counts and collected fees are no longer KPI cards for the same reason. Do not reintroduce a figure next to a section that already reports it.
- **No placeholder data on the dashboard (2026-09-22)**: the owner-requested sample-preview layer (`src/dashboardPreviewData.js` with `PREVIEW_ENABLED`, `shouldPreviewData()`, `SAMPLE_*` rows and the amber "Sample preview" banner) was removed permanently together with its file. It contradicted the zero-synthetic-rows rule below and made an empty database look like live traffic. Empty collections render empty states; do not add a preview/sample/fixture mode back to any dashboard surface.
- **One spacing rhythm (2026-09-22)**: `.enhanced-dashboard-root` defines `--ed-gap: 16px`, and every top-level block gap and every in-block grid gap (`ed-canvas-grid`, `ed-people-row`, `ed-rail`) is `gap: var(--ed-gap)` — never a literal. The density media queries move page padding only (16px ≤1440px, 28px ≥2000px); they must not fork the gap. Card padding is one value (24px): `SectionCard`'s `p-6`, the hourly card, and the `.ed-card-actions` footer. Two deliberate exceptions are documented rather than silently diverged: `StatCard` keeps its shared `p-5` (20px) because five other pages use it, and `StatCard.Grid`'s built-in `mb-6` is neutralized for this page only via `.enhanced-dashboard-root .ed-kpi-grid { margin-bottom: 0 }` (a flex column with a uniform gap must not also stack a 24px margin, which produced a 40px hole under the KPI row). Trends live directly in the card body: `TrendArea` and the `.ed-donut-row` carry no nested panel, border or padding of their own, so a card holds one chart and nothing else. Measured after the change: every inter-block gap 16px, KPI margin 0, panel padding 24px, chart inset 0.
- **Chart axis contract (2026-09-22)**: the bar plot's y-axis column and its plot area both use the same `--plot-h` height, so tick labels and grid lines cannot drift from the bars. The axis ceiling comes from `niceAxisMax()` in `utils/barHeight.js` (rounded up to a value divisible by four) — shared by the bar plot and `TrendArea` so the two can never disagree about their ceiling — and every bar is a percentage of that ceiling — the tallest bar's top sits exactly on the grid line carrying its own value. The previous version labelled the top tick with the raw maximum while drawing bars against a 150px track inside a 200px chart and aligned the two with literal top/bottom margins, so the tallest bar never reached its own label. Bar colour is one series colour with the peak highlighted only when it is a unique maximum (`isUniquePeak()`); tied maxima highlight nothing.
- Issues triage table (`ManageIssues.jsx`) shows the six essential columns (Ticket ID, Type, Tracking ID, Reporter, Status, Date Reported) inside the page's normal width — no `min-w-[1720px]`; product/category/ETA/evidence stay in the View & Resolve modal. The search input carries an `aria-label`. Breadcrumbs no longer say "Parcel Information Management" (pages breadcrumb through their section names).
- Page components keep their own full titles (e.g. `MonitorRiderStatus.jsx` still renders "Monitor Rider Status" as its `<h1>`); only the menu label is shortened.
- `handleMenuClick`/section-sync work off `visibleMenuItems` (a flatMap of all sections), so parent auto-open and rail flyouts need no per-section logic. Empty role-filtered sections are skipped at render.
- Breadcrumbs in `PageHeader` consumers must mirror the section names: `['Dashboard', 'People', 'Customer List']`, `['Dashboard', 'Support', 'Issues']`, `['Dashboard', 'Support', 'App Notifications']`, `['Dashboard', 'Admin', 'Activity Log']`, `['Dashboard', 'Shipments', 'Manage Parcels']`, `['Dashboard', 'Admin', 'Archives']`. `ManageParcels` and `Settings` (Archives) render the shared `PageHeader` instead of hand-rolled headers.

### Sidebar Navigation Animation & Transitions (2026-09-19)
The collapsible navigation rail (`ad-sidebar`, 256px expanded ↔ 72px collapsed) must maintain fluid, continuous easing (`0.28s cubic-bezier(0.32, 0.72, 0, 1)`) synchronized with `ad-main` (`margin-left`). Strict rules to prevent visual snapping, layout jumps, or broken animations:
1. **Zero `display: none` on collapsible items**: Never hide sidebar nav text, logo text, section headers, badges, chevrons, or user profile strips via `display: none`. Setting `display: none` immediately aborts all CSS transitions on opacity and transform, causing abrupt visual jumps and popping. Use coordinated `max-width: 0`, `max-height: 0`, `opacity: 0`, `overflow: hidden`, `white-space: nowrap`, and `transform: translateX(-8px)/translateY(-4px)`.
2. **No `transition: none !important` under `@media (prefers-reduced-motion)` on the navigation shell**: Windows machines configured for performance (or with window animations disabled, e.g. `MinAnimate = 0`) automatically trigger Chromium's `prefers-reduced-motion: reduce` query. Placing blanket `transition: none !important` overrides on `.ad-sidebar` or `.ad-main` strips layout transitions and causes instant snapping on desktop environments. Do not suppress structural shell layout transitions.
3. **Static Axis Icon & Logo Alignment**:
   - Never use `justify-content: center` to center icons or logos on sidebar collapse; `justify-content` cannot be transitioned and teleports icons horizontally.
   - Keep `justify-content: flex-start` at all times and use symmetric padding geometry:
     - 72px rail: Nav container `padding: 16px 12px`, item `padding: 10px 15px`, 18px icon → `12 + 15 + 9 = 36px` center (`72 / 2 = 36px`).
     - Header: `padding: 20px 14px`, 44px logo circle → `14 + 22 = 36px` center.
     - Center of all icons and logo circle remains at exact X = 36px across both states (0px horizontal displacement).
4. **Responsive Density Consistency**:
   - Whenever media queries target laptop screens (`@media (max-width: 1440px)` in `responsive-density.css`), always explicitly mirror `.ad-wrapper.ad-sidebar--collapsed .ad-sidebar { width: 72px; }` alongside `.ad-main { margin-left: 72px; }` so width transitions seamlessly without cascading asymmetry.
5. **No inline styles on collapsible containers**: Containers that animate height/padding (such as `.ad-sidebar-user`) must not have hardcoded inline `style={{ padding, border }}` in JSX, which overrides CSS classes and blocks transitions.

### Design system (`src/components/ui/`)
`Badge`, `Modal`, `DataTable`, `FilterBar`, `SectionCard`, `EmptyState`, `ListSkeleton`, `TableSkeleton`, `StatCard`, `PageHeader`, `CardSectionHeader`, `CardFooter`, `StatusBadge`, `ErrorBoundary` (wraps every routed page with Retry/Back UI), `Tooltip` (+ `Tooltip.css`), `ToastContext` (global toast provider in `App.jsx`), `vehicleIcons` (`VehicleIcon` lucide component + `vehicleGlyphSvg` SVG data-URI + `vehicleTypeLabel`), `statusColors.js` (canonical palettes: `PARCEL_STATUS_COLORS`, `SELLER_STATUS_COLORS`, `RIDER_STATUS_BADGE`, `STATUS_HINTS`) — the REAL/DEMO account-category helpers `ACCOUNT_CATEGORY_TONE` / `ACCOUNT_CATEGORY_LABEL` and `src/demoUtils.js` cited by older revisions are **not present** in the tree (verified 2026-09-20; see §7 and §11). `AlertBanner.jsx` was deleted 2026-09-20 (no importers).

### Parcel-status normalization (`src/utils/parcelStatus.js`, 2026-09-14)
Single source of truth for mapping bridge-synced statuses to display labels: `normalizeParcelStatus()` handles the mobile backend's Title-case vocabulary **and** the legacy lowercase-hyphenated web form, case-insensitively; `isDeliveredStatus` / `isReturnFamilyStatus` / `isInTransitFamilyStatus` power counts and filters. Before this module, `ManageParcels`' 5-entry `REAL_STATUS_MAP` silently coerced mobile statuses it didn't know (`Out for Delivery`, `Picked Up`, `Returning`…) into "Pending", and the dashboard's client-side fallback compared exact Title-case strings against lowercase DB values. Every surface that renders a parcel status must consume this module — never re-derive local maps. The old dashboard `dateRange` select (state never read) was removed in the same pass.

**Icon rule** — no emoji/text glyphs as icons in UI strings; all use lucide-react SVGs (`aria-hidden`, icon-only buttons carry `aria-label`).

### UI design guardrails (anti-AI-slop)
- Read `skills/no-slop-ui/SKILL.md` before making any visual, layout, or styling change.
- On conflict, `skills/no-slop-ui/YTO_ADAPTATIONS.md` outranks the skill defaults.
- After UI changes, run `skills/no-slop-ui/examples/review-checklist.md`.
- `skills/avoid-ai-design/` is the audit/rewrite skill (upstream: funboy322/avoid-ai-design): use it when asked to audit existing UI for AI-design tells, de-slop a screen, or as the post-build audit of generated frontend. It complements `no-slop-ui` (which stays the build-time guardrail); in rewrite mode it stops at this project's brand tokens and conventions — see `skills/avoid-ai-design/YTO_ADAPTATIONS.md`.
- **Non-technical UI copy**: All user-facing copy in modals, forms, toast notifications, badges, empty states, and tables must use plain, non-technical words. Avoid engineering, database, and API terminology.

### Corner radius system (2026-09-20 Parity)
Corners are a mathematical hierarchy, not an arbitrary single value:
1. **Tiered Scale (`src/design-tokens.css`)**:
   - `xs` (`4px` / `--yto-radius-xs`): Status tags, micro-badges, indicator dots, nested tags.
   - `sm` (`6px` / `--yto-radius-sm`): Sub-menu links, table action buttons, small inputs.
   - `md` (`8px` / `--yto-radius-md`): Standard buttons, form fields, select dropdowns.
   - `lg` (`12px` / `--yto-radius-lg`): Nested card panels, tab trays, filter bars.
   - `xl` (`16px` / `--yto-radius-xl`): Primary dashboard cards, table panels, metric widgets.
   - `2xl` (`20px` / `--yto-radius-2xl`): Modal dialogs, floating overlays, slide sheets.
   - `full` (`9999px` / `--yto-radius-full`): Strict pill/circle; reserved for avatars, toggle switches, and single-line indicator tags.
2. **Concentric Arcs Rule ($R_{\text{inner}} = R_{\text{outer}} - \text{Padding}$)**: Child containers nested inside parent cards must follow concentric geometry so corners never crowd or bulge.
3. **Pill is a Shape, Not a Number**: Never apply pill radii (`100px`, `22px`) to rectangular buttons, multi-line cards, or text fields.
4. **Boundary Edge Docking**: When elements touch container or screen borders (docked rails, bottom sheets, histogram bars at base), contacting corners must be squared (`0px`).
5. **Concentric Focus Rings**: Interactive focus halos must use concentric box-shadows (`box-shadow: 0 0 0 2px var(--yto-surface), 0 0 0 4px var(--yto-brand-orange)`) rather than positive-offset outlines that pinch at the corners.
6. **Media Clipping**: Image containers in cards must either clip to the parent container via `overflow: hidden`, or follow the concentric formula $R_{\text{img}} = R_{\text{card}} - P$.

### Services
- `src/services/api.js` — centralized client: `API_ROOT = import.meta.env.VITE_API_URL || 'https://yto-express-backend.onrender.com'`; `apiFetch(path, opts)` attaches `Authorization: Bearer`; on 401 with token-expiry errors clears the token and dispatches `yto:auth_expired`. **Token key: `yto_token`** — `remember=true` → `localStorage`, `remember=false` → `sessionStorage` (session storage wins on read). `adminLogin(email, password, remember)`; `notificationsApi.sendEmail`; collection helpers (`sellersApi`, `ridersApi`, `parcelsApi`, `parcelLocationsApi`, `accountsApi`). `API_BASE` is module-private; the `dashboardApi` helper was removed 2026-09-20 — the dashboard calls `apiFetch('/dashboard/stats')` directly.
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
- **Admin bootstrap** (`ensureAdminAccounts()`): Runs when `ENABLE_ADMIN_BOOTSTRAP=1` (requires `ALLOW_ADMIN_BOOTSTRAP_IN_PROD=1` in production). Insert-only upsert of 3 canonical admins (`superadmin@ytoexpress.com`, `staff@ytoexpress.com`, `hub@ytoexpress.com`) with bcrypt-hashed passwords from `ADMIN_PASSWORD_*` env. Never overwrites existing accounts. The same opt-in gate also covers `ensureOfficialDemoAccounts()`, which upserts the official demo seller, customer, and rider as `accountCategory: 'DEMO'` and then backfills `REAL` for non-demo records missing a category.

### Route table
| Endpoint | Methods | Notes |
|---|---|---|
| `/` | GET | Server banner |
| `/api/events/stream` | GET | SSE (no JWT required) |
| `/api/events/stats`, `/api/events/history`, `/api/events/alerts` | GET | SSE broadcaster metrics (auth) |
| `/api/events/threshold` | PUT | Peak-alert threshold (auth) |
| `/api/bridge/*` | POST | See §6 |
| `/api/sellers`, `/api/riders` | GET/POST | Also PUT/DELETE (`sendApproval` on status change) |
| `/api/customers` | GET | Customers are created exclusively via bridge (`POST /api/bridge/sync-user`), never via POST here |
| `/api/customers/:id` | PUT | Updates an existing customer record |
| `/api/customers/stats`, `/api/customers/:id/orders` | GET | Customer aggregates + order history by `customerId` |
| `/api/activity-log` | GET | Audit trail from registration/statusHistory across roles; `limit` ≤ 200, `role` filter |
| `/api/notifications` (GET) + `/api/notifications/:id/read` (PATCH) | GET/PATCH | App-originated notifications (`AdminNotification` collection); `limit` ≤ 200 (default 50), `role`/`type` filters; PATCH marks one read (auth). Frontend calls `/api/notifications` (`AppNotifications.jsx`, `NotificationBell.jsx`) — the `/api/app-notifications` name previously listed here never existed in `Server.js` (corrected 2026-09-20) |
| `/api/parcels`, `/api/parcel-locations` | GET/POST/PUT/DELETE | Parcel CRUD; POST bridges parcel to mobile backend via `BridgeClient.syncParcel`; PUT updates status, pushes `BridgeClient.sendStatus` + SSE `parcel-updated` (see §6) |
| `/api/dashboard/stats` | GET | KPIs: parcels, delivered %, riders, active riders, avg rating, total deliveries, sellers |
| `/api/accounts` | GET/POST | Admin accounts |
| `/api/accounts/:id` | PUT | bcrypt-hashes new passwords on change |
| `/api/accounts/:id/status` | PATCH | Toggle Active/Deactivated; **super_admin cannot be deactivated** |
| `/api/health` | GET | Liveness probe (added 2026-09-22): `{ status, db, uptimeSeconds }`; 200 when DB connected, 503 otherwise. The login page's server-status pill polls this (was `/`, which returned prose and could not distinguish the API from any other server) |
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
| `AdminNotification` | `notificationId` (Android `Notification._id` for traceability), `role` (`customer`/`seller`/`rider`/`admin`), `title` (required), `message`, `type` (free string, default `system` — **no enum**), `relatedId` (tracking number / ticket id), `source` (default `mobile-app`), `read` (bool), `readAt`, timestamps — app-originated notifications fanned in via `/api/bridge/sync-notification`, surfaced in the App Notifications panel + bell. (Earlier revisions listed `body`/`targetUserId`/`targetRole`/`ORDER|SECURITY|SYSTEM` — those fields do not exist on the model; corrected 2026-09-20) |

---

## 5. Real-Time Layer (SSE)

- **`/api/events/stream`**: `text/event-stream`, 30s heartbeat, no JWT on the stream itself. `sseBroadcaster` singleton tracks connected clients, connection history (capped 500), peak alerts (threshold `SSE_PEAK_THRESHOLD` default 5, 1-min cooldown, optional email via `ADMIN_EMAIL`).
- **Events broadcast**: `user-synced`, `parcel-synced`, `location-synced`, `parcel-updated`, `issue-synced`, `issue-status-updated`, `duty-status-synced`, `notification-synced`, `peak-alert`.
- **Client hook (`useSSE.js`)**: connects to `/api/events/stream?token=<jwt>`; auto-reconnect every 3s; after **5 failed attempts falls back to HTTP polling every 5s** (`/api/activity-log?limit=10`, diffing timestamps); exposes `{ connected, mode: 'sse'|'polling'|'offline', lastEvent, on(type, cb), retry() }`; optional browser notifications per event type.

---

## 6. Cross-Platform Bridge Protocol (`server/bridgeRoutes.js`)

Bidirectional REST bridge with the Android backend (`yto_express_backend`). Every route validates its payload, never lets an exception escape (all try/caught + `logBridgeError`), answers `{ success, message, data }` / `{ success: false, error, details }`, and broadcasts SSE to admin clients. Shared-secret gate via `BRIDGE_API_KEY` that **fails closed**: when the key is unset every bridge route answers `503` (`Bridge API key not configured. All bridge access denied.`) rather than continuing — a deploy that forgets the key must never accept unauthenticated writes to users, parcels, issues and notifications. Mirrors the mobile backend's own fail-closed guard; `BRIDGE_API_KEY` here and `WEB_BRIDGE_API_KEY` on the mobile side must hold the same value.

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

**Outbound** (`server/utils/BridgeClient.js`): `sendStatus(trackingNumber, status)`, `sendApproval(email, role, status, enterpriseId)`, `syncParcel(parcelData)`, `pollChanges(since)` (targets the mobile backend's `/api/bridge/poll-changes`), `sendIssueStatus(ticketId, status, adminNotes)`, `sendUserUpdate(email, role, updates)` (pushes admin-side profile edits to the mobile backend's `POST /api/bridge/receive-user-update` — the Android route must exist for these edits to land), `healthCheck()` — HTTP(S) POST with retry (3 attempts, exponential backoff, 10s timeout) to `ANDROID_BACKEND_URL`.

---

### 7. Realm Model — REAL and DEMO Accounts

The portal holds one live dataset. **`accountCategory` state (verified 2026-09-20):** no file in `server/models/` declares the field and nothing under `src/` reads it, although legacy Atlas documents still carry `'REAL'`/`'DEMO'` values and the maintenance scripts (`backfill_issue_enrichment.js`, `clean_web_db.js`, `audit_web_db.js`) still query/select it. `src/demoUtils.js`, `ACCOUNT_CATEGORY_TONE`, and `ACCOUNT_CATEGORY_LABEL` do **not** exist in the tree. Demo rows belong to the App database; `server/seed_official_demo_accounts.js` is **retired** (2026-09-18) — it refuses to seed and exits 0.
1. **Accounts**: Canonical admin logins are `superadmin@ytoexpress.com`, `staff@ytoexpress.com`, and `hub@ytoexpress.com` (see §3). Customer/seller/rider accounts arrive via the mobile bridge and retain their signup emails.
2. **Clean empty states (default)**: 0 records renders the clean empty-state view — zero synthetic or mock injections anywhere in the client. Unreachable backends display an error banner, never simulated data. This is the behavior of every build unless the opt-in flag below is explicitly set.
3. **Database specification**: Pinned to Atlas DB `/test` (`server/.env` `MONGO_URI`); operational collections clean.
4. **`VITE_DEMO_MODE` opt-in fallback (added 2026-09-22)**: a build-time-only flag (`import.meta.env.VITE_DEMO_MODE === '1'`), read once in `src/services/api.js`. Unset/anything else → off, identical to pre-2026-09-22 behavior; a plain `vite build` never activates it. When set to `'1'` at build time (e.g. a pre-launch/UAT Render static-site build step, never the eventual real-production build), `apiFetch` transparently swaps an **empty** GET response on a known collection route (`/customers`, `/sellers`, `/riders`, `/parcels`, `/issues`, `/accounts`, `/parcel-locations`, `/activity-log`, `/notifications`, `/dashboard/stats`) for the fixture set in `src/services/demoFixtures.js` — the same linked dataset `scripts/qa/seedServer.mjs` serves locally (both import it; one dataset, not two that can drift). Mutations (POST/PUT/PATCH/DELETE) are never intercepted, and a real non-empty response is never overridden. `AnalyticsDashboard.jsx` renders a persistent amber "Demo Data" banner across every page whenever the flag is on, so fabricated rows are never mistaken for real ones. Turning it off for the real-production build is a one-line env change + redeploy — no code change, no database cleanup (nothing was ever written to Mongo).

---

## 8. Engineering Rules

1. **State isolation & navigation** — views route via `PAGE_MAP`; `currentUser` is top-level state; 401 expiry → clean logout to `LoginPage`.
2. **Backend robustness** — external services (Twilio, Semaphore, Nodemailer) fall back to simulation when credentials are absent; bridge routes never throw unhandled; errors logged with payload context and structured JSON.
3. **Data integrity & Enterprise IDs** — strict formats: tickets `TICK-<YEAR>-<5-digit>`; **mobile-account enterprise IDs use the compact Web-minted format (2026-09-11):** sellers `YTOS<YEAR><4-digit>`, riders `YTOR<YEAR><4-digit>`, customers `YTOC<YEAR><4-digit>` (per-collection-per-year sequence counted across BOTH compact and legacy shapes, collision-safe probe before minting; legacy `YTO-SELL/RIDE/CUST-<YEAR>-<5-digit>` rows remain valid/grandfathered); admins `YTOA<YEAR><4-digit>` (e.g. `YTOA20260001`; the earlier `YTO-ADM-XXX` form is no longer minted). The Web is the sole minting authority: the sync-user response carries `data.enterpriseId`, the Android backend persists it (`User.webEnterpriseId`) and it is backfilled via `receive-approval` (`enterpriseId` field). Sync-parcel additionally mints + returns the canonical QR payload (`YTOQR1|<tracking>|<sellerEntId>|<customerEntId>`, degraded to the plain tracking number when no enterprise party resolves) and the POD geofence spec (`trackingGeofence` = `{kind:'POD_RING', center:{lat,lng}, radiusMeters:100}`) — both persisted on the web `Parcel` (`qrPayload`, `sellerEnterpriseId`, `customerEnterpriseId`, `trackingGeofence`) and echoed to the mobile side. Web-created parcels pushed to Android must resolve a seller explicitly (`sellerId`/registered `sellerEmail`) — no arbitrary-seller fallback.
4. **Input hygiene** — email `.toLowerCase().trim()`; phone `.replaceAll("[^0-9]","")`; no emojis in UI strings or logs; no hardcoded impersonating fallbacks (`"seller@gmail.com"`, `"YTO Rider"`, `"Store Warehouse"`).
5. **Code quality** — retain docstrings/comments/schemas; responsive desktop + mobile layouts; clear error boundaries.
6. **Auth** — bcrypt 10 rounds; JWT 24h; token key `yto_token`; 401 interceptor clears storage + emits `yto:auth_expired`.
7. **Persistent shell architecture (2026-09-19)** — `AnalyticsDashboard` is the persistent application shell hosting the sidebar and global header; it must NEVER be keyed to `activePage` (e.g. `key={activePage}`) in `App.jsx`, as key changes unmount the entire shell, resetting sidebar scroll position to 0 and flashing submenus. The route-keyed `ErrorBoundary` (`key={`${activeMenuItem}:${retryNonce}`}`) is scoped inside `.ad-main` wrapping only dynamic page contents (`renderPage()`).
8. **Caveman protocol** — When activated (`caveman`), maintain 100% technical accuracy, zero conversational filler, exact paths, and preserve verification gates.

---

## 9. Scripts & Tooling (`server/`, `scripts/`)

- `Server.js` boot — `ensureAdminAccounts()` initializes canonical admins if enabled (see §3).
- `server/clean_web_db.js` — Wipes operational data (customers/sellers/riders/parcels/issues). Pinned to Atlas database `/test`. Render `MONGO_URI` env var must end in `/test`.
- `server/seed_official_demo_accounts.js` — **RETIRED (2026-09-18):** the Web database is REAL-only, so the script refuses to seed and exits 0. Demo accounts live in the App database, and `src/demoUtils.js` does not exist in this tree.
- `server/backfill_issue_enrichment.js` — One-time (idempotent) maintenance pass that persists issue enrichment — stable `ticketId`, `accountCategory`, and product fields from the linked Parcel — mirroring the read-only derivation in `GET /api/issues` field-for-field. Default **dry run**; pass `--write` to persist. Requires `MONGO_URI`. Retire once a dry run reports 0 rows. **Fixed 2026-09-20:** the unsupported `accountCategory` write was removed — `Issue` has no such schema path, `GET /api/issues` never derived it, and nothing in `src/` reads it, so the pass had been flagging rows as un-enriched for a field it could never persist. It now enriches exactly `ticketId`, `productName`, `productCategory`, `eta`.
- `server/audit_web_db.js` — **Read-only** Web database audit (2026-09-18): per-collection row counts plus demo/synthetic/placeholder-row detection (demo emails, pinned fixture IDs/plates/licences, test tracking + ticket IDs, parcels missing real coordinates, orphan `ParcelLocation` rows, unread notification backlog). Contains no `updateOne`/`deleteMany`/upsert — safe to run against Atlas. Requires `MONGO_URI`.
- `server/purge_web_demo_rows.js` — Removes the canonical mobile demo fixtures from the **Web** database only (`superadmin@gmail.com` / `staff@gmail.com` / `hub@gmail.com`, plus the seller/customer/rider demo rows) and the legacy `AdminNotification` registration noise (`role: 'admin'`, `type: 'security'`, `title: 'New User Registration'`, `source: 'mobile-app'`, empty `relatedId`). Dry-run by default; deletes only under `PURGE_CONFIRM=YES`. Requires `MONGO_URI`. **Executed 2026-09-20** (6 rows deleted); verified state — `Account: 3` (all REAL, `YTOA2026000{1,2,3}`), `AdminNotification: 0`, Seller/Customer/Rider/Parcel/ParcelLocation/Issue: 0 each.
- **CORS callback contract (2026-09-22, root cause of the login-page hang)** — `isAllowedCorsOrigin` in `Server.js` was a boolean predicate `(origin) => bool`. cors@2.8.6 treats a *function* `origin` option as the async contract `(origin, callback) => void`; the predicate never invoked its 2nd argument, so cors's internal continuation never ran, `next()` never fired, and **every request hung until the client timed out** — the login spinner's ~60s stall + error (`apiFetch` abort) and the perpetually orange "Connecting..." pill. Fixed to `cb(null, origin)` (allow, reflected) / `cb(null, false)` (deny, no ACAO, request proceeds). Verified against the installed `server/node_modules/cors/lib/index.js` (`middlewareWrapper` → `originCallback`).
- **`app.set('trust proxy', 1)`** (2026-09-22) — Render terminates TLS and forwards the client IP in `X-Forwarded-For`; without it express-rate-limit v8 cannot key counters on the real client IP behind the proxy and its validation layer can 500 every login on the deployed backend.
- `scripts/dev.cjs` — combined launcher (frontend + server). **`npm run dev` is the standard single command** for the full stack (API @ 3001 + Vite @ 5173, Ctrl+C kills both); granular options: `npm run dev:web` (frontend only), `npm run dev:server` (backend only); `dev:all` retained as alias.
- `package.json` scripts: `dev` (full stack via dev.cjs), `dev:web` (vite), `dev:server`, `dev:all`, `start` (dev.cjs), `build` (`vite build`), `lint`, `preview`.
- `scripts/qa/` — `npm run qa:layout` headless layout sweep across every sidebar page x viewport width. Two rules for the seed (`seedServer.mjs`), learned 2026-09-22:
  - **The seed must exercise the populated path, not just a non-empty array.** Riders carry `registrationId` and `isOnDuty`, and every parcel that has moved past Pending carries `riderId` (the rider's `registrationId`) + a real `updatedAt`. Riders deliberately carry **no** stored `successRate`/`deliveries`, so the dashboard must compute them from the linked parcels — pre-filling them would hide a broken computation behind a plausible stored number. Keep the link when adding rows: a parcel without `riderId` silently empties the ranked leaderboard.
  - **`CONTENT_CHECKS` asserts the populated blocks.** A page can be crash-free, overflow-free and still useless because a data-driven block fell back to its empty state. The Dashboard entry requires a ranked leaderboard row, a status breakdown, the composition ring and exactly four KPI cards; it reports `CONTENT` per width and fails the sweep. Falsified 2026-09-22 by pointing `QA_FIXTURES_DIR` at rider-less parcels — 4/4 widths failed. Extend this map (don't add per-page prose) for any block whose emptiness would be a silent regression.
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
│  │  ├─ services/                   (api.js, useSSE.js)
│  │  ├─ verification/               (PendingVerificationsTable, ReviewModal, SendSMSModal, ...)
│  │  └─ (utils: exportUtils, leafletLoader, luzonCityCoords, hubGeofenceData, useRouteAnimation)
│  │  ├─ (top-level src utilities: AdminProfileDropdown, ConnectionHistoryChart,
│  │  │   LiveRiderMap, NotificationBell, PaginationControls, ParcelProgressTimeline,
│  │  │   PeakAlertBanner, sellerRiderData.js)
│  │  ├─ server/                     (sibling of src/ under my-react-app/)
│  │  │  ├─ Server.js, bridgeRoutes.js, clean_web_db.js
│  │  │  ├─ models/                  (Account, Seller, Rider, Customer, Parcel, ParcelLocation, Issue, AdminNotification)
│  │  │  ├─ utils/                   (BridgeClient.js, sseBroadcaster.js)
│  │  │  └─ .env                     (MONGO_URI, JWT_SECRET, ADMIN_PASSWORD_*, TWILIO_*, SEMAPHORE_*, EMAIL_*, ANDROID_BACKEND_URL, BRIDGE_API_KEY, SSE_PEAK_THRESHOLD)
│  │  ├─ scripts/                    (dev.cjs, qa/layoutSweep.mjs, qa/seedServer.mjs)
│  │  ├─ public/                     (assets: WebLoginBg_hi.jpg, yto_express_logo_mark.png)
│  │  └─ skills/                     (11 SKILL.md files)
└─ (no `__MACOSX/` — junk directory absent from the workspace as of 2026-09-20)
```

## 11. Security: Known Issue — `.env` Credential Leak & Pending History Scrub (Future Fix)

**Status:** LOCAL SCRUB COMPLETE — REMOTE PUSH BLOCKED (as of 2026-09-03).

### What happened
- `my-react-app/server/.env` was committed into git history from the initial commit (`426e719`) with live credentials. The repo is **public** on GitHub (`LewisHamilton444/yto-express`), and `origin/main` at `b6c89fc` **still contains the file** — the leak is live on the remote.
- Local history was scrubbed with `git filter-repo`: `.env` and the junk `Icon\r` file were removed from all 25 commits. New local HEAD: `642ff8d` at scrub time — since advanced by the nodemailer IPv4/CORS fix commits (`c7e0e15` security batch → `70ec918` as of 2026-09-09, plus one uncommitted `family: 4` working-tree change in `Server.js`).
- `.env` was restored to disk (from backup) and added to `.gitignore` — it must never be committed again.
- Pre-scrub backup (contains original history incl. `.env`): `C:\Users\ADMIN\React_Projects\yto-express-backup.git`.
- `vite build` passes; **UPDATE 2026-09-09:** working tree fixes applied and committed locally — nodemailer `family: 4` IPv4 fix, `accountCategory` added to the `Parcel` schema, and the hardcoded `JWT_SECRET` fallback removed (startup now requires the env var). Verify `JWT_SECRET` is set in Render env before the next deploy. **UPDATE 2026-09-13 (de-demo migration):** `accountCategory` was removed from all models at that point. **UPDATE 2026-09-17 (INCORRECT — corrected 2026-09-20):** this note claimed `accountCategory` had been restored; direct inspection of the working tree shows no model field, no `ACCOUNT_CATEGORY_*` palette, and no `src/demoUtils.js`, and `seed_official_demo_accounts.js` is retired. §7 now reflects the verified state.

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

