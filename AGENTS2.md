# AGENTS2.md — YTO Express Platform Architecture & Engineering Reference

## 1. Project Overview & System Architecture

**YTO Express** is a comprehensive logistics and supply-chain management web application paired with a mobile backend bridge. It provides real-time tracking, rider dispatching, seller and rider onboarding/verification, hub parcel intake, geo-fencing, analytics reporting, and enterprise-grade role-based account management.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          YTO Express Platform                          │
├──────────────────────────────────┬─────────────────────────────────────┤
│        Frontend (React 19)       │          Backend (Node / Express)   │
│  - Vite 7 + React 19             │  - Express 5 + MongoDB (Mongoose 9) │
│  - Lucide Icons + Leaflet Maps   │  - REST API + Twilio / Semaphore    │
│  - Multi-view Single-Page App    │  - Cross-Platform Android Bridge    │
│  - Dynamic Global Search & Feed  │  - Role-based Access Control (RBAC) │
└──────────────────────────────────┴─────────────────────────────────────┘
```

---

## 2. Directory Structure & File Mappings

### Root Workspace: `c:\Users\ADMIN\React_Projects\YTO\YTO\`
- `.gitignore` — Global ignore rules
- `AGENTS2.md` — Complete architecture, file mappings, and engineering rules reference
- `my-react-app/` — Main project root (Frontend + Backend)

---

### Frontend: `my-react-app/` & `my-react-app/src/`

#### Core App Configuration & Entry Points
- `package.json` — Frontend dependencies (`react` v19.2, `lucide-react`, `vite` v7.2)
- `vite.config.js` — Vite build and dev server configuration
- `index.html` — HTML shell
- `src/main.jsx` — React DOM entry point
- `src/App.jsx` — Primary application shell, authentication state router, and view switcher
- `src/index.css` — Global typography and reset styles

#### Page Views & Modules (`src/`)
- `AnalyticsDashboard.jsx` / `.css` — Primary dashboard with live KPIs, parcel volume charts, status breakdown, and recent activity
- `ProcessSellerInformation.jsx` / `.css` — Seller registration and onboarding management
- `ViewSeller.jsx` / `.css` — Seller listing, detail modals, verification status, and export utilities
- `ProcessParcelInformation.jsx` / `.css` — Parcel registration, origin/destination assignments, weight & billing
- `ManageParcels.jsx` — Comprehensive parcel dispatch table, status transitions, batch updates, and filters
- `ProcessRiderInformation.jsx` / `.css` — Rider registration, license details, and payout settings
- `MonitorRiderStatus.jsx` / `.css` — Real-time rider workload, active/inactive toggling, delivery metrics
- `GenerateRiderDataReport.jsx` / `.css` — Performance analytics, commission/payout calculations, and exportable rider summaries
- `ManageParcelLocation.jsx` / `.css` — Hub location assignments, live transit coordinates, waypoint management
- `MonitorParcel.jsx` / `.css` — Luzon hub geofence tracker and route boundaries
- `GenerateTrackingInformation.jsx` / `.css` — Waybill and tracking lookup with timeline visualization
- `HubParcelReceiving.jsx` — Inbound hub scanner and receipt processing
- `LiveRiderMap.jsx` — Real-time Leaflet map of active riders, Luzon coordinates, and delivery routes
- `ManageAccounts.jsx` — Enterprise user account management, role allocation, and activation toggles
- `Settings.jsx` / `.css` — System preferences, database backup/reset utilities, and environment configurations
- `SettingsArchiveView.jsx` — Archived seller/rider/parcel audit logs and historical snapshots
- `Loginpage.jsx` / `.css` — Enterprise authentication screen with credential validation
- `Logout.jsx` / `.css` — Secure session termination confirmation screen

#### Shared Components & Utilities (`src/`)
- `GlobalHeader.jsx` — Top navigation bar with branding, user profile, and quick actions
- `GlobalSearch.jsx` — Global search overlay indexing parcels, riders, and sellers
- `NotificationBell.jsx` — Notification center for status changes and verification alerts
- `AdminProfileDropdown.jsx` — Admin profile actions and role badges
- `PaginationControls.jsx` — Reusable table pagination component
- `ParcelProgressTimeline.jsx` — Step-by-step parcel milestone tracker
- `exportUtils.js` — CSV / Excel data export helpers
- `leafletLoader.js` — Dynamic Leaflet map injector
- `luzonCityCoords.js` — Luzon geographic coordinates lookup table
- `luzonMockData.js` — Seed data for Luzon hubs and transit points
- `sellerRiderData.js` — Reference mock/fallback dataset for sellers and riders
- `alertsFeed.js` — Live simulation and feed generators for operations alerts
- `useRouteAnimation.js` — Custom hook for pathing and transit animations

#### Verification Subsystem (`src/verification/`)
- `PendingVerificationsTable.jsx` — Review queue for new seller and rider applicants
- `ReviewModal.jsx` — Document inspection and approval/rejection dialog
- `SendSMSModal.jsx` — Manual SMS notification dispatch to applicants
- `Toast.jsx` — Toast alert component
- `useToasts.js` — Hook for managing toast lifecycles
- `mockPendingRegistrations.js` — Pending registration fixtures

#### Services (`src/services/`)
- `api.js` — Centralized Axios/Fetch API client for all backend endpoints

---

### Backend: `my-react-app/server/`

#### Core Server Files
- `package.json` — Backend dependencies (`express` v5.2, `mongoose` v9.7, `cors`, `dotenv`, `nodemailer`, `twilio`)
- `Server.js` — Express server initialization, DB connection, CRUD routes, SMS/Email engines, analytics aggregates
- `bridgeRoutes.js` — Cross-platform Android backend REST synchronization adapter (`/api/bridge/*`)
- `.env` — Environment configurations (`MONGO_URI`, `PORT`, `TWILIO_*`, `SEMAPHORE_*`, `EMAIL_*`, `BRIDGE_API_KEY`)

#### Mongoose Database Models (`server/models/`)
- `Account.js` — Admin accounts (`name`, `email`, `password`, `role`: `super_admin` | `admin` | `operator`, `status`)
- `Seller.js` — Merchant profiles (`registrationId`, `fullName`, `email`, `phone`, `idType`, `idNumber`, `status`, `accountCategory`)
- `Rider.js` — Delivery rider profiles (`registrationId`, `riderName`, `email`, `phone`, `vehicleType`, `vehiclePlate`, `status`, `deliveries`, `rating`)
- `Customer.js` — Recipient/Customer profiles (`customerId`, `fullName`, `email`, `phone`, `address`)
- `Parcel.js` — Shipment records (`trackingNumber`, `senderName`, `receiverName`, `item`, `weight`, `origin`, `destination`, `status`, `events`)
- `ParcelLocation.js` — Geographic waypoints and hub coordinates (`trackingNumber`, `latitude`, `longitude`, `hubName`, `timestamp`)

---

## 3. Data & API Architecture

### REST API Endpoints Overview

| Endpoint | Method | Description |
|---|---|---|
| `/` | `GET` | Server health check |
| `/api/sellers` | `GET`, `POST` | List all sellers / Create new seller |
| `/api/sellers/:id` | `PUT`, `DELETE` | Update seller / Remove seller |
| `/api/riders` | `GET`, `POST` | List all riders / Create new rider |
| `/api/riders/:id` | `PUT`, `DELETE` | Update rider / Remove rider |
| `/api/parcels` | `GET`, `POST` | List all parcels / Create new parcel |
| `/api/parcels/:id` | `PUT`, `DELETE` | Update parcel status & details / Remove parcel |
| `/api/parcel-locations` | `GET`, `POST` | Real-time parcel coordinates and route log |
| `/api/dashboard/stats` | `GET` | Real-time aggregate operational KPIs |
| `/api/accounts` | `GET`, `POST` | List accounts / Create new admin account |
| `/api/accounts/:id` | `PUT` | Edit account details/password |
| `/api/accounts/:id/status` | `PATCH` | Toggle active/deactivated status |
| `/api/accounts/login` | `POST` | Authenticate user credentials |
| `/api/sms/send` | `POST` | Dispatch SMS (Twilio -> Semaphore -> Simulated fallback) |
| `/api/email/send` | `POST` | Dispatch Email (Gmail SMTP -> Simulated fallback) |
| `/api/admin/reset-database` | `DELETE` | Purge operational data with explicit `RESET` token |

### Android Bridge Synchronization (`/api/bridge/`)
- `POST /api/bridge/sync-user` — Accepts Android mobile app user registrations, categorizes email (`REAL` vs `DEMO`), auto-generates Enterprise IDs (`YTO-SELL-YYYY-XXXXX`, `YTO-RIDE-YYYY-XXXXX`, `YTO-CUST-YYYY-XXXXX`), and synchronizes into Seller/Rider/Customer collections.
- `POST /api/bridge/sync-parcel` — Flattens nested sender/recipient shipment payloads from mobile into standard web parcel schema.
- `POST /api/bridge/sync-location` — Ingests live rider GPS telemetry.

---

## 4. Engineering Rules & Best Practices

1. **State Isolation & Navigation**
   - The frontend routes views via `PAGE_MAP` in `App.jsx` based on the active user session and view state.
   - Authentication is managed via `currentUser` in top-level state and passed down to child views.

2. **Backend Robustness & Graceful Degradation**
   - External services (Twilio, Semaphore, Nodemailer) must always fall back gracefully to simulation mode when credentials are not configured.
   - Bridge routes must never throw unhandled exceptions or crash the Express process; errors must be logged with payload context and return structured JSON.

3. **Data Integrity & Enterprise ID Format**
   - Auto-generated Enterprise IDs must adhere strictly to format: `YTO-<PREFIX>-<YEAR>-<5-digit sequence>` (e.g. `YTO-SELL-2026-00001`).
   - Super admin IDs follow `YTO-ADM-XXX`.

4. **Code Quality & Maintenance**
   - Retain all existing docstrings, comments, and schemas.
   - Use clear error boundaries and responsive UI layouts for both desktop and mobile viewports.

