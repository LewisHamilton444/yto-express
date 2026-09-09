---
name: profile-management-skill
description: Handles user account management, role badging (REAL/DEMO), enterprise ID generation, and profile editing for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Profile Management Skill

## 0. Identity

- **Role:** User Account Manager and Role Badge Enforcer
- **Authority:** Tier-2 normative root skill for `skills/profile-management-skill/`.
- **Must not define:** Hardcoding "seller@gmail.com" or "YTO Rider" in UI bindings; dynamic enterprise ID generation not enforced; accountCategory badge not matching user role.
- **Normative base:** `AGENTS2.md`; `src/ManageAccounts.jsx`; `src/ProcessSellerInformation.jsx`; `server/bridgeRoutes.js` (enterprise ID generation).

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Manage admin accounts (`ManageAccounts.jsx`: CRUD + activate/deactivate) and seller/rider/customer ledgers; enterprise IDs are generated server-side in bridge `sync-user` (`YTO-SELL/RIDE/CUST-<YEAR>-<5-digit>` per collection per year; `YTO-ADM-XXX` reserved). Badge `REAL` (green) vs `DEMO` (gray). |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `enterpriseId`, `accountCategory`, `isDemo`, and badge tone values. |
| 4 | Constraints | `Account.role` ∈ `super_admin|staff|hub_receiver`; `accountCategory: REAL|DEMO`; badge tones from `Badge.jsx` (`emerald` REAL / `slate` DEMO); no hardcoded fallbacks in UI bindings. |
| 5 | Input | Account email (normalized: `.toLowerCase().trim()`); phone (sanitized: `.replaceAll("[^0-9]", "")`); password (bcrypt-hashed server-side); `accountCategory` derived by `isDemoEmail()`. |
| 6 | Context | Demo sessions stay in their realm via server-side `getCategoryFilter`; real sessions get clean empty states; `super_admin` accounts can never be deactivated (403). |
| 7 | Audience | ManageAccounts.jsx; ProcessSellerInformation.jsx; ViewSeller.jsx; CustomerList.jsx. |
| 8 | Success Criteria | Account created/updated with correct enterprise ID (bridge path) or admin credentials (bcrypt); category badge correct; no cross-role leakage. |
| 9 | Examples | Mobile seller registers → bridge `sync-user` → `YTO-SELL-2026-00123` minted; green `REAL` badge. Admin changes a password → `PUT /api/accounts/:id` bcrypt-hashes it. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Admin creates new admin/staff account | YES | `POST /api/accounts` with normalized email; server derives `accountCategory` via `isDemoEmail()` (canonical demo logins + yto.com/example.com/ytoexpress.com/demo-prefix → DEMO; everything else REAL); password bcrypt-hashed. |
| User views account profile | YES | Extract `fullName`, `email`, `phone` dynamically from respective model; normalize email `.toLowerCase().trim()`; sanitize phone; badge displays correct color. |
| Form edits submitted | YES | Validate inputs; normalize email; sanitize phone; update MongoDB document; refresh `currentUser` state; re-badges with correct color. |
| Demo account accessing live APIs | NO | Refuse: demo sessions must never mutate live database collections; show `[DEMO MODE]` banner; route to fast-path mock engine. |
| Real account accessing demo fixtures | NO | Refuse: real accounts strictly query live MongoDB endpoints with clean empty states (zero synthetic mock injections). |

## 3. Execution Workflow

### Step 1: Normalize and Classify Input

- **Action:** Trim and lowercase email input via `.toLowerCase().trim()`; sanitize phone via `.replaceAll("[^0-9]", "")`; classification mirrors `isDemoEmail()` in `demoUtils.js` + `Server.js`.
- **Input:** Raw email/phone from the account form; admin role from session.
- **Stop Condition:** Normalization completed; `isDemo` flag set; `accountCategory` determined.
- **Validation:** 
  - Email matches regex after normalization; 
  - Phone digits count between 10-12 after stripping; 
  - `isDemo` correctly classified: canonical demo logins / yto.com-family domains / `demo` prefix → `true`; every other address → `false`.

### Step 2: Generate or Validate Enterprise ID (server-side)

- **Action:** Enterprise IDs are minted ONLY in bridge `sync-user` (`generateEnterpriseId`): `YTO-<PREFIX>-<YEAR>-<5-digit>` with per-collection-per-year sequence counters (`registrationId`/`customerId` fields); `YTO-ADM-XXX` exists but is never called by the mobile app. The admin UI never generates IDs client-side.
- **Input:** `role` (seller/rider/customer); collection model.
- **Stop Condition:** Enterprise ID generated or validated; format confirmed.
- **Validation:** 
  - New ID: `YTO-SELL-2026-00001` format (per-year counter); 
  - Existing ID: regex `YTO-(SELL|RIDE|CUST)-\d{4}-\d{5}` matches.

### Step 3: Render Account with Role Badge

- **Action:** Display account details with the `accountCategory` badge via `Badge.jsx` tones: `emerald` (green) for REAL, `slate` (gray) for DEMO. No hardcoded "seller@gmail.com" or "YTO Rider" in UI bindings.
- **Input:** `fullName`/`name`, `email`, `phone`, enterprise ID, `accountCategory` from the MongoDB document; `isDemo` flag.
- **Stop Condition:** Account rendered with correct badge tone; all values dynamically extracted from models; no hardcoded fallbacks.
- **Validation:** 
  - Badge tone: REAL → `emerald`; DEMO → `slate` (per `ACCOUNT_CATEGORY_TONE`); 
  - No `"seller@gmail.com"` hardcoded in any UI binding; 
  - No `"YTO Rider"` hardcoded in any UI binding; 
  - All values extracted from respective models dynamically.

### Step 4: Handle Form Edits and Submit

- **Action:** On form submit; normalize email `.toLowerCase().trim()`; sanitize phone `.replaceAll("[^0-9]", "")`; dispatch `PUT /api/accounts/:id` (server bcrypt-hashes a new password and re-derives `accountCategory` on email change); toggle status via `PATCH /api/accounts/:id/status` (super_admin protected); views re-fetch after success.
- **Input:** Form data; `accountId`; JWT via `apiFetch`.
- **Stop Condition:** Backend responds `200 OK`; list state refreshed; badge tone re-rendered.
- **Validation:** 
  - `200 OK` from backend; 
  - `accountCategory` matches the (possibly changed) email; 
  - Deactivating a `super_admin` returns 403 and the UI surfaces the error.

### Step 5: Enforce Real vs. Demo Account Isolation

- **Action:** If `isDemo === true`: `[DEMO MODE]` banner + demo fixtures permitted when the backend returns empty (e.g., `MOCK_ACCOUNTS` in ManageAccounts). If `isDemo === false`: strict live queries; clean empty state (0 records = no mock rows).
- **Input:** `isDemo` flag from auth session; `currentUser.role`.
- **Stop Condition:** Correct isolation mode activated; appropriate datasets loaded; banner displayed or hidden.
- **Validation:** 
  - Demo: `[DEMO MODE]` banner visible; fixtures only as a fallback when the live collection is empty/unreachable; 
  - Real: `[DEMO MODE]` banner hidden; clean empty state if 0 records; live DB queries only; no mock injections.

## 4. Output Specification

```json
{
  "module": "profile-management-skill",
  "status": "account_managed",
  "enterpriseId": "YTO-SELL-YYYY-XXXXX / YTO-RIDE-YYYY-XXXXX / YTO-CUST-YYYY-XXXXX (bridge-generated)",
  "accountCategory": "REAL | DEMO",
  "badgeTone": "emerald (REAL) | slate (DEMO)",
  "isDemo": true/false,
  "emailNormalized": true/false,
  "phoneSanitized": true/false
}
```

## 5. Validation Gate

- [ ] Email normalized: `.toLowerCase().trim()`
- [ ] Phone sanitized: `.replaceAll("[^0-9]", "")`
- [ ] `isDemoEmail()` evaluated correctly: canonical demo logins `superadmin/staff/hub@gmail.com`, domains `yto.com`/`example.com`/`ytoexpress.com`, `demo` prefix — all other addresses REAL
- [ ] Enterprise ID format: `YTO-<ROLE>-<YEAR>-<5-digit>` — generated server-side by bridge `sync-user` only
- [ ] Badge tones: REAL → emerald (green); DEMO → slate (gray), per `ACCOUNT_CATEGORY_TONE`
- [ ] No hardcoded fallbacks: `"seller@gmail.com"`, `"YTO Rider"`, `"Store Warehouse"` never in UI bindings
- [ ] All values dynamically extracted from respective models
- [ ] Demo isolation: `[DEMO MODE]` banner shown if `isDemo === true`; live DB queries if `isDemo === false`
- [ ] Real isolation: clean empty state (0 records); no mock orders; live MongoDB endpoints only

## 6. Anti-Triggers and Calibration

- **Over-execution:** Generating enterprise ID before email normalization complete (produces incorrect sequential counter; ID clash).
- **Under-execution:** Skipping `isDemoUser()` gate → real accounts query demo fixtures; demo accounts mutate live database.
- **Calibration default:** Trigger only when `rawEmail.length > 5` AND `@` present AND `targetRole` defined AND `currentUser.isLoggedIn === true`.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Normalize) | AP-1 (vague task verb) | Complete normalization before any database operation; no partial processing. |
| 3 (Badge Render) | AP-11 (forgotten context) | `isDemo` flag always checked; badge color determined by context; never silently dropped. |
| 4 (Form Edits) | AP-2 (two tasks in one prompt) | State update split into separate submit step; no navigation logic embedded in form. |
| 5 (Isolation) | AP-45 (no human review trigger) | Real vs. Demo gate always enforced; user confirmation not required for mode switch. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `ManageAccounts.jsx`, `ProcessSellerInformation.jsx`, `api.js`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Mobile seller registers with email `seller@example.com`; expects enterprise ID generation and a REAL badge."

**Output:** "Taking from this: profile management via bridge. Constraints: bridge `sync-user` mints `YTO-SELL-2026-XXXXX`; `categorizeEmail('seller@example.com')` → DEMO (example.com is a demo domain); badge tone slate. Proceeding with account sync and badge rendering."

**Failure case:** The user attempts to create account with hardcoded `"seller@gmail.com"` in UI binding → agent refuses: all values must dynamically extract from respective models; no hardcoded fallbacks allowed.

## 11. Additional Constraint

- **No hardcoded fallbacks:** Never hardcode `"seller@gmail.com"`, `"YTO Rider"`, or `"Store Warehouse"` in UI bindings. All values must dynamically extract from respective models. (From AGENTS2.md Rule #3)