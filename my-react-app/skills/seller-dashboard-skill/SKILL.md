---
name: seller-dashboard-skill
description: Handles seller dashboard KPIs, parcel analytics, status tracking, and clean empty state enforcement for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Seller Dashboard Skill

## 0. Identity

- **Role:** Seller Dashboard Data Loader and Empty State Enforcer
- **Authority:** Tier-2 normative root skill for `skills/seller-dashboard-skill/`.
- **Must not define:** Hardcoded mock shipments in real account empty states; displaying zero-order cards for real admins; failing to enforce `isDemo` category filtering.
- **Normative base:** `AGENTS2.md`; `src/AnalyticsDashboard.jsx`; `src/ManageParcels.jsx`. NOTE: there is no `SellerDashboard.jsx` in this codebase — the admin dashboard view is `AnalyticsDashboard.jsx`; seller-scoped screens are the seller ledger and parcel views.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Load dashboard KPIs via `GET /api/dashboard/stats` (category-filtered); enforce clean empty state for real accounts (0 records = no mock orders); demo accounts may load fixtures (`FALLBACK_PARCELS`, `MOCK_ACCOUNTS`) under a `[DEMO MODE]` banner only when the live collection is empty/unreachable. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `kpisLoaded`, `emptyState`, `demoBanner`, and `categoryFilter` values. |
| 4 | Constraints | Real non-demo admins (`!currentUser?.isDemo`): When MongoDB collections have 0 records, display clean empty state graphics with zero synthetic or hardcoded mock injections. Demo admins (`currentUser?.isDemo == true`): If the backend collection is empty or unreachable, load test datasets (`FALLBACK_PARCELS` in ManageParcels, `MOCK_ACCOUNTS` in ManageAccounts, `mockRiders`/`mockSellers` in `sellerRiderData.js`) with the `[DEMO MODE]` banner/flag. |
| 5 | Input | `currentUser.isDemo`; `currentUser.role`; `PAGE_MAP` view switcher; category filter (`All`/`Real Records`/`Demo Records`). |
| 6 | Context | `isDemoUser()` gate all repository reads and writes; demo sessions must never mutate live database collections; all values dynamically extract from respective models; category filter always available. |
| 7 | Audience | SellerDashboard.jsx; ManageParcels.jsx; ViewSeller.jsx; AnalyticsDashboard.jsx; category toolbar. |
| 8 | Success Criteria | KPIs loaded from `/api/dashboard/stats`; empty state displayed correctly based on `isDemo`; category filter functional; `[DEMO MODE]` banner visible only for demo accounts. |
| 9 | Examples | Admin logs in → KPIs display: total parcels, delivered %, riders, active riders, avg rating, total deliveries, sellers (per `/api/dashboard/stats`); if 0 records → clean empty state (real) or `[DEMO MODE]` fixtures (demo). |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Seller dashboard mounts | YES | Fetch `/api/dashboard/stats` with JWT token; parse KPIs; check `currentUser.isDemo`; render empty state or KPI cards accordingly; apply category filter. |
| Category filter changed (All/Real Records/Demo Records) | YES | Update API query with `category=real` or `category=demo`; re-fetch data; re-render parcel cards with correct badging; update toolbar state. |
| Real account with 0 parcels | YES | Display clean empty state graphic; zero mock orders; no `[DEMO MODE]` banner; category filter: `All`/`Real Records`/`Demo Records` (only REAL shows). |
| Demo account with 0 parcels | YES | Display `[DEMO MODE]` yellow banner; load `FALLBACK_PARCELS`/`MOCK_ACCOUNTS`; category filter: `All`/`Real Records`/`Demo Records` (all three show). |
| User navigates away from dashboard | NO | Cancel ongoing API requests; clear state; prevent memory leaks; no background polling unless explicitly needed. |

## 3. Execution Workflow

### Step 1: Fetch KPIs from Dashboard Stats

- **Action:** `GET /api/dashboard/stats?category=<realm>` with Bearer JWT token; parse the server's KPI response (parcels, delivered %, riders, active riders, avg rating, total deliveries, sellers); check `currentUser.isDemo` flag.
- **Input:** JWT token from `localStorage`; `currentUser.isDemo`.
- **Stop Condition:** KPIs extracted; ready for state rendering.
- **Validation:** 
  - `200 OK` response; 
  - KPIs are numeric; 
  - `currentUser.isDemo` flag set; 
  - Response matches expected schema.

### Step 2: Determine Empty State Based on isDemo

- **Action:** If `currentUser.isDemo === false` (real account): if `totalParcels === 0` → render clean empty state graphic; zero mock orders; no `[DEMO MODE]` banner; category filter shows `All`/`Real Records`/`Demo Records` (only REAL records display). If `totalParcels > 0` → render KPI cards with parcel volume charts.
- **Input:** `totalParcels` from Step 1; `currentUser.isDemo`.
- **Stop Condition:** Empty state or KPI cards rendered; category toolbar state updated.
- **Validation:** 
  - Real: `0 records = Clean empty state` (NO mock fallback); 
  - Demo: if `0 records` → `[DEMO MODE]` banner + test datasets; if `>0 records` → KPI cards with demo data.

### Step 3: Render KPI Cards or Empty State

- **Action:** If KPIs > 0: render dashboard KPI cards (parcel volume charts, status breakdown, recent activity). If KPIs === 0: render empty state per `isDemo` classification.
- **Input:** KPIs from Step 1; `isDemo` from Step 2.
- **Stop Condition:** Dashboard UI updated; user sees either KPI cards or empty state.
- **Validation:** 
  - KPI cards render with correct numbers; 
  - Empty state graphic displays; 
  - No mock shipments in real account empty state; 
  - `[DEMO MODE]` banner yellow if demo account.

### Step 4: Apply Category Filter (All/Real Records/Demo Records)

- **Action:** User selects category filter; the server accepts `category=ALL`/`category=REAL`/`category=DEMO` (uppercase; default = the admin's own realm); re-fetch and re-render with correct badging.
- **Input:** Filter selection from toolbar; `currentUser.isDemo`; JWT token.
- **Stop Condition:** Data re-fetched; UI updated with filtered results; badge tones correct.
- **Validation:** 
  - `category=REAL` → only REAL records show; 
  - `category=DEMO` → only DEMO records show; 
  - `category=ALL` → all records show with badges; 
  - Badge tones: REAL → emerald (green), DEMO → slate (gray) per `ACCOUNT_CATEGORY_TONE`.

### Step 5: Handle Demo Banner Visibility

- **Action:** If `currentUser.isDemo === true`: demo fixtures (`FALLBACK_PARCELS` / `MOCK_ACCOUNTS` / `mockRiders`) are permitted only when the live collection is empty or unreachable; the UI flags simulated data (e.g., `SimulatedFeedBadge` / using-fallback state) rather than a permanently pinned banner.
- **Input:** `currentUser.isDemo`; `totalParcels`; `FALLBACK_PARCELS`/`MOCK_ACCOUNTS` test data.
- **Stop Condition:** Banner rendered or hidden; test data loaded if applicable.
- **Validation:** 
  - Demo: `[DEMO MODE]` banner yellow visible; 
  - Real: `[DEMO MODE]` banner hidden; 
  - Test datasets loaded only for demo accounts with 0 records.

## 4. Output Specification

```json
{
  "module": "seller-dashboard-skill",
  "status": "dashboard_loaded",
  "kpis": { "totalParcels": number, "deliveredPercent": number, "riders": number, "activeRiders": number, "avgRating": number, "totalDeliveries": number, "sellers": number },
  "emptyState": true/false,
  "usingFallbackData": true/false,
  "categoryFilter": "ALL | REAL | DEMO",
  "badgeTones": { "REAL": "emerald", "DEMO": "slate" }
}
```

## 5. Validation Gate

- [ ] `GET /api/dashboard/stats?category=<realm>` dispatched with Bearer JWT token
- [ ] KPIs parsed from the server's stats schema (parcels, delivered %, riders, active riders, avg rating, total deliveries, sellers)
- [ ] `currentUser.isDemo` flag evaluated
- [ ] Real account (isDemo=false): 0 records → clean empty state; >0 → KPI cards
- [ ] Demo account (isDemo=true): demo fixtures allowed only as empty/unreachable fallback, with simulated-data flagging
- [ ] Category filter functional: ALL/REAL/DEMO with correct badging
- [ ] Badge tones: REAL → emerald (green), DEMO → slate (gray) per `ACCOUNT_CATEGORY_TONE`
- [ ] No mock shipments in real account empty state
- [ ] API responses match expected schema

## 6. Anti-Triggers and Calibration

- **Over-execution:** Fetching dashboard stats more frequently than on mount (wastes bandwidth; no real-time benefit beyond SSE/5s-polling via cross-device-skill).
- **Under-execution:** Skipping `isDemo` check → real admins see mock shipments; demo admins miss `[DEMO MODE]` banner; category filter broken.
- **Calibration default:** Trigger only on mount and category filter change; no continuous polling for dashboard KPIs.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 2 (Empty State) | AP-1 (vague task verb) | Clear conditional: real = clean empty state; demo = [DEMO MODE] banner; never ambiguous. |
| 4 (Category Filter) | AP-11 (forgotten context) | `isDemo` flag always checked; category options dynamically determined by context. |
| 5 (Demo Banner) | AP-45 (no human review trigger) | Banner auto-places; user confirmation not required; deterministic based on `isDemo`. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `AnalyticsDashboard.jsx`, `ManageParcels.jsx`, `ManageAccounts.jsx`, `api.js`, `sellerRiderData.js`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Admin logs into dashboard; expects KPIs to display parcel volume and rider stats; if 0 records → clean empty state (real account)."

**Output:** "Taking from this: admin dashboard. Constraints: isDemo gate; clean empty state for real admins; demo fixtures only as fallback for demo admins. Proceeding with KPI fetch and empty state rendering."

**Failure case:** The user attempts to display mock shipments in real account empty state → agent refuses: real non-demo admins (`!currentUser?.isDemo`) display clean empty state with zero synthetic mock injections; no hardcoded fallback records.

## 11. Additional Constraint

- **Android-only styling tokens do not apply here:** `bg_dashboard_gradient.xml` and `@color/background_main` are Android resources; the Web styles via Tailwind + `statusColors.js` palettes. Do not port Android drawable rules into Web views.