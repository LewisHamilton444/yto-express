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
- **Normative base:** `AGENTS2.md`; `src/components/ManageAccounts.jsx`; `src/components/ProcessSellerInformation.jsx`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Manage enterprise user accounts; generate dynamic enterprise IDs (`YTO-SELL-2026-XXXXX`, `YTO-RIDE-2026-XXXXX`, `YTO-CUST-2026-XXXXX`); badge `REAL` (green) vs `DEMO` (gray); enforce no hardcoded fallbacks in UI bindings. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `enterpriseId`, `accountCategory`, `isDemo`, and `badgeColor` values. |
| 4 | Constraints | Enterprise IDs dynamic: `YTO-SELL-YYYY-XXXXX` etc.; `Account.category: REAL | DEMO`; badge: Green `REAL`, Gray `DEMO`; no hardcoded fallbacks in UI bindings. |
| 5 | Input | User email (normalized: `.toLowerCase().trim()`); phone (sanitized: `.replaceAll("[^0-9]", "")`); role (`CUSTOMER|SELLER|RIDER|ADMIN`); accountCategory (`REAL|DEMO`). |
| 6 | Context | `isDemoUser()` gate all repository reads and writes; demo sessions must never mutate live database collections; all values dynamically extract from respective models. |
| 7 | Audience | ManageAccounts.jsx; ProcessSellerInformation.jsx; ViewSeller.jsx; CustomerList.jsx; profile-edit modals. |
| 8 | Success Criteria | Account created/updated with correct `enterpriseId`; `accountCategory` badge displays correct color; `isDemo` flag propagated; no cross-role leakage. |
| 9 | Examples | Admin creates new seller account → `YTO-SELL-2026-00123` generated; green `REAL` badge displayed; seller can manage inventory. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| Admin creates new seller account | YES | Generate enterprise ID `YTO-SELL-2026-XXXXX` sequentially; set `accountCategory: REAL` if `@gmail.com`, `DEMO` if `@yto.com`; display badge; save to MongoDB. |
| User views account profile | YES | Extract `fullName`, `email`, `phone` dynamically from respective model; normalize email `.toLowerCase().trim()`; sanitize phone; badge displays correct color. |
| Form edits submitted | YES | Validate inputs; normalize email; sanitize phone; update MongoDB document; refresh `currentUser` state; re-badges with correct color. |
| Demo account accessing live APIs | NO | Refuse: demo sessions must never mutate live database collections; show `[DEMO MODE]` banner; route to fast-path mock engine. |
| Real account accessing demo fixtures | NO | Refuse: real accounts strictly query live MongoDB endpoints with clean empty states (zero synthetic mock injections). |

## 3. Execution Workflow

### Step 1: Normalize and Classify Input

- **Action:** Trim and lowercase email input via `.toLowerCase().trim()`; sanitize phone via `.replaceAll("[^0-9]", "")`; evaluate `isDemoUser()`: returns `true` ONLY for `@yto.com`, `@example.com` or designated test logins.
- **Input:** Raw email/phone from profile-edit form; `targetRole` from session context.
- **Stop Condition:** Normalization completed; `isDemo` flag set; `accountCategory` determined.
- **Validation:** 
  - Email matches regex after normalization; 
  - Phone digits count between 10-12 after stripping; 
  - `isDemo` correctly classified: `@yto.com`/`@example.com` → `true`; `@gmail.com`/`other live domains` → `false`.

### Step 2: Generate or Validate Enterprise ID

- **Action:** If creating new account: generate dynamic Enterprise ID `YTO-SELL-2026-XXXXX` (or `YTO-RIDE-2026-XXXXX`, `YTO-CUST-2026-XXXXX`) sequentially. If updating: validate existing ID format matches `YTO-<ROLE>-2026-XXXXX`.
- **Input:** `targetRole`; `accountCategory` (REAL/DEMO); sequential counter from backend.
- **Stop Condition:** Enterprise ID generated or validated; format `YTO-<ROLE>-2026-XXXXX` confirmed.
- **Validation:** 
  - New ID: `YTO-SELL-2026-00001` format; increment from last used; 
  - Existing ID: regex `YTO-(SELL|RIDE|CUST|ADM)-2026-\d{5}` matches.

### Step 3: Render Account with Role Badge

- **Action:** Display account details with `accountCategory` badge: Green `REAL` (`#43A047`) for live `@gmail.com` accounts; Gray `DEMO` (`#9CA3AF`) for `@yto.com`/`@example.com`. No hardcoded "seller@gmail.com" or "YTO Rider" in UI bindings.
- **Input:** `fullName`, `email`, `phone`, `enterpriseId`, `accountCategory` from MongoDB document; `isDemo` flag.
- **Stop Condition:** Account rendered with correct badge color; all values dynamically extracted from model; no hardcoded fallbacks.
- **Validation:** 
  - Badge color: REAL → `#43A047` (green); DEMO → `#9CA3AF` (neutral gray); 
  - No `"seller@gmail.com"` hardcoded in any UI binding; 
  - No `"YTO Rider"` hardcoded in any UI binding; 
  - All values extracted from respective model dynamically.

### Step 4: Handle Form Edits and Submit

- **Action:** On form submit; normalize email `.toLowerCase().trim()`; sanitize phone `.replaceAll("[^0-9]", "")`; dispatch `PUT /api/accounts/:id` with updated payload; refresh `currentUser` state; re-badges with correct color; emit `REFRESH_LOGISTICS` broadcast.
- **Input:** Form data; `accountId`; `currentUser.jwtToken`.
- **Stop Condition:** Backend responds `200 OK`; `currentUser` state updated; badge color re-rendered; `REFRESH_LOGISTICS` dispatched.
- **Validation:** 
  - `200 OK` from backend; 
  - `currentUser.isDemo` preserved or updated; 
  - Badge color matches new `accountCategory`; 
  - `REFRESH_LOGISTICS` broadcast dispatched; all fragments refresh.

### Step 5: Enforce Real vs. Demo Account Isolation

- **Action:** If `isDemo === true`: show `[DEMO MODE]` banner; load test datasets (`FALLBACK_PARCELS`, `MOCK_ACCOUNTS`); category filter: `All`/`Real Records`/`Demo Records`. If `isDemo === false`: strict live DB queries; clean empty state (0 records = no mock orders); category filter: `All`/`Real Records`/`Demo Records`.
- **Input:** `isDemo` flag from auth session; `currentUser.role`.
- **Stop Condition:** Correct isolation mode activated; appropriate datasets loaded; banner displayed or hidden.
- **Validation:** 
  - Demo: `[DEMO MODE]` banner visible; test datasets loaded; no live DB queries; 
  - Real: `[DEMO MODE]` banner hidden; clean empty state if 0 records; live DB queries only; no mock injections.

## 4. Output Specification

```json
{
  "module": "profile-management-skill",
  "status": "account_managed",
  "enterpriseId": "YTO-SELL-2026-XXXXX / YTO-RIDE-2026-XXXXX / YTO-CUST-2026-XXXXX / YTO-ADM-XXX",
  "accountCategory": "REAL | DEMO",
  "badgeColor": "#43A047 (REAL) | #9CA3AF (DEMO)",
  "isDemo": true/false,
  "emailNormalized": true/false,
  "phoneSanitized": true/false
}
```

## 5. Validation Gate

- [ ] Email normalized: `.toLowerCase().trim()`
- [ ] Phone sanitized: `.replaceAll("[^0-9]", "")`
- [ ] `isDemoUser()` evaluated correctly: ONLY `@yto.com`, `@example.com`, `customer@gmail.com`, `seller@gmail.com`, `rider@gmail.com`
- [ ] Enterprise ID format: `YTO-<ROLE>-2026-XXXXX` (new) or `YTO-<ROLE>-2026-XXXXX` matches existing (update)
- [ ] Badge color: REAL → `#43A047` (green); DEMO → `#9CA3AF` (neutral gray)
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

**Input:** "Admin creates new seller account with email `seller@example.com`; expects enterprise ID generation and REAL badge."

**Output:** "Taking from this: profile management. Constraints: enterprise ID `YTO-SELL-2026-XXXXX`; green `REAL` badge; no hardcoded fallbacks. Proceeding with account creation and badge rendering."

**Failure case:** The user attempts to create account with hardcoded `"seller@gmail.com"` in UI binding → agent refuses: all values must dynamically extract from respective models; no hardcoded fallbacks allowed.

## 11. Additional Constraint

- **No hardcoded fallbacks:** Never hardcode `"seller@gmail.com"`, `"YTO Rider"`, or `"Store Warehouse"` in UI bindings. All values must dynamically extract from respective models. (From AGENTS2.md Rule #3)