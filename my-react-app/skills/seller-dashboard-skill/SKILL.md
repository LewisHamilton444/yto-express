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
- **Normative base:** `AGENTS2.md`; `src/components/SellerDashboard.jsx`; `src/components/ManageParcels.jsx`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Load seller KPIs (parcel volume, status breakdown, recent activity); enforce clean empty state for real accounts (0 records = no mock orders); display `[DEMO MODE]` banner for demo accounts with pre-seeded sample records. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `kpisLoaded`, `emptyState`, `demoBanner`, and `categoryFilter` values. |
| 4 | Constraints | Real non-demo admins (`!currentUser?.isDemo`): When MongoDB collections have 0 records, display clean empty state graphics with zero synthetic or hardcoded mock injections. Demo admins (`currentUser?.isDemo == true`): If backend database is empty or offline, load test datasets (`FALLBACK_PARCELS`, `MOCK_ACCOUNTS`) with yellow `[DEMO MODE]` status banner. |
| 5 | Input | `currentUser.isDemo`; `currentUser.role`; `PAGE_MAP` view switcher; category filter (`All`/`Real Records`/`Demo Records`). |
| 6 | Context | `isDemoUser()` gate all repository reads and writes; demo sessions must never mutate live database collections; all values dynamically extract from respective models; category filter always available. |
| 7 | Audience | SellerDashboard.jsx; ManageParcels.jsx; ViewSeller.jsx; AnalyticsDashboard.jsx; category toolbar. |
| 8 | Success Criteria | KPIs loaded from `/api/dashboard/stats`; empty state displayed correctly based on `isDemo`; category filter functional; `[DEMO MODE]` banner visible only for demo accounts. |
| 9 | Examples | Seller logs in → KPIs display: total parcels, pending, in-transit, delivered counts; if 0 parcels → clean empty state (real) or `[DEMO MODE]` banner with samples (demo). |

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

- **Action:** `GET /api/dashboard/stats` with Bearer JWT token; parse response for `totalParcels`, `pending`, `inTransit`, `delivered`, `returns`, `cancelled`; check `currentUser.isDemo` flag.
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

- **Action:** User selects category filter; update API query parameters: `category=all`/`category=real`/`category=demo`; re-fetch `/api/dashboard/stats`; re-render KPIs and parcel cards with correct badging (Green `REAL`, Gray `DEMO`).
- **Input:** Filter selection from toolbar; `currentUser.isDemo`; JWT token.
- **Stop Condition:** Data re-fetched; UI updated with filtered results; badge colors correct.
- **Validation:** 
  - `category=real` → only REAL badge parcels show; 
  - `category=demo` → only DEMO badge parcels show; 
  - `category=all` → all parcels show with badges; 
  - Badge colors: REAL → `#43A047` (green), DEMO → `#9CA3AF` (neutral gray).

### Step 5: Handle Demo Banner Visibility

- **Action:** If `currentUser.isDemo === true`: display yellow `[DEMO MODE]` status banner at top of dashboard; if `totalParcels === 0` AND demo → load `FALLBACK_PARCELS`/`MOCK_ACCOUNTS`; banner always visible for demo accounts regardless of record count.
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
  "kpis": { "totalParcels": number, "pending": number, "inTransit": number, "delivered": number, "returns": number, "cancelled": number },
  "emptyState": true/false,
  "demoBanner": true/false,
  "categoryFilter": "All | Real Records | Demo Records",
  "badgeColors": { "REAL": "#43A047", "DEMO": "#9CA3AF" }
}
```

## 5. Validation Gate

- [ ] `GET /api/dashboard/stats` dispatched with Bearer JWT token
- [ ] KPIs parsed: `totalParcels`, `pending`, `inTransit`, `delivered`, `returns`, `cancelled`
- [ ] `currentUser.isDemo` flag evaluated
- [ ] Real account (isDemo=false): 0 parcels → clean empty state; >0 parcels → KPI cards
- [ ] Demo account (isDemo=true): [DEMO MODE] banner yellow visible; test datasets loaded if 0 records
- [ ] Category filter functional: All/Real Records/Demo Records with correct badging
- [ ] Badge colors: REAL → `#43A047` (green), DEMO → `#9CA3AF` (neutral gray)
- [ ] `[DEMO MODE]` banner: yellow only for demo accounts; hidden for real accounts
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
| Vite React | verified | Executed in current workspace; integrates with `SellerDashboard.jsx`, `ManageParcels.jsx`, `api.js`, `luzonMockData.js`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Seller logs into dashboard; expects KPIs to display total parcels, status breakdown; if 0 parcels → clean empty state (real account)."

**Output:** "Taking from this: seller dashboard. Constraints: isDemo gate; clean empty state for real admins; [DEMO MODE] banner for demo. Proceeding with KPI fetch and empty state rendering."

**Failure case:** The user attempts to display mock shipments in real account empty state → agent refuses: real non-demo admins (`!currentUser?.isDemo`) display clean empty state with zero synthetic mock injections; no hardcoded fallback records.

## 11. Additional Constraint

- **Dashboard canvas:** `bg_dashboard_gradient.xml` warm-violet (`#F3E6F7 → #FAF3F7 → #FFFDFB`). New screens MUST use these drawables instead of flat `@color/background_main`. (From AGENTS2.md Rule #94)