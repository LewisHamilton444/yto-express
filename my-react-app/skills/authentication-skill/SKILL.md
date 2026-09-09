---
name: authentication-skill
description: Handles user authentication, OTP verification, and demo/real account isolation for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Authentication Skill

## 0. Identity

- **Role:** Auth Module Router and OTP Dispatcher
- **Authority:** Tier-3 normative root skill for `skills/authentication-skill/`.
- **Must not define:** Bypassing live OTP verification for real accounts; direct MongoDB writes without session validation.
- **Normative base:** `AGENTS2.md`; `src/services/api.js`; `src/main.jsx`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Route admin login attempts through `POST /api/accounts/login` (bcrypt `comparePassword`, 24h JWT embedding `isDemo`); demo vs. real classification via `isDemoEmail()` in `src/demoUtils.js` + `server/Server.js`. NOTE: the Web Admin has NO OTP flow — OTP (`/api/auth/*`) exists only on the Android side. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `token`, `loginRole`, `isDemo`, `accountCategory`, and token-storage location. |
| 4 | Constraints | Real accounts log in with their live bcrypt password; demo admins (`superadmin@gmail.com`, `staff@gmail.com`, `hub@gmail.com`) use `DEMO_ADMIN_PASSWORD_*` env-sourced passwords. Deactivated accounts are rejected (403). |
| 5 | Input | Email + password credentials; remember-me flag (persistent vs session token). |
| 6 | Context | Prevents cross-role leakage; enforces `isDemo` gate before any data fetch. |
| 7 | Audience | Active session user; LoginPage.jsx; App.jsx. |
| 8 | Success Criteria | User authenticated with valid 24h JWT token; `currentUser.isDemo` derived; role-scoped data loaded. |
| 9 | Examples | Login with `superadmin@gmail.com` + `DEMO_ADMIN_PASSWORD_SUPERADMIN` value → `200` + JWT (`isDemo: true`). Login with an unknown password → `401 Invalid email or password.` |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| User enters email ending with `@gmail.com`, `@yahoo.com`, or other live domain | YES | Normal `POST /api/accounts/login` against the live Account collection (`isDemoEmail()` returns false unless the exact address is allowlisted). |
| User enters a canonical Web demo login (`superadmin@gmail.com`, `staff@gmail.com`, `hub@gmail.com`) | YES | Same login endpoint; JWT embeds `isDemo: true`; views may load demo fixtures under the `[DEMO MODE]` banner. |
| User enters email ending with `@yto.com`, `@example.com`, `@ytoexpress.com`, or a `demo`-prefixed address | YES | `isDemoEmail()` → true; same endpoint; `accountCategory: DEMO` derived on create/update. |
| User enters email without `@` symbol or invalid format | NO | Reject input; show validation error; do not proceed to login. |
| Account `status === 'Deactivated'` | NO | `403 This account has been deactivated. Contact your Super Admin.` |

## 3. Execution Workflow

### Step 1: Normalize and Validate Input

- **Action:** Trim and lowercase email input; sanitize phone via `.replaceAll("[^0-9]", "")`.
- **Input:** Raw email/phone from Loginpage.jsx.
- **Stop Condition:** Email format valid (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`).
- **Validation:** Email matches regex; phone digits count between 10-12 after stripping.

### Step 2: Classify Demo vs. Real Account

- **Action:** Evaluate `isDemoUser`: returns `true` ONLY for `@yto.com`, `@example.com` or designated test logins.
- **Input:** Normalized email from Step 1.
- **Stop Condition:** Classification completed; `isDemo` flag set.
- **Validation:** If `isDemo == false` → proceed to Step 3. If `isDemo == true` → proceed to Step 4.

### Step 3: Live Login (Real Accounts)

- **Action:** Dispatch `POST /api/accounts/login` with normalized email + password; backend runs `Account.comparePassword` (bcrypt with legacy plaintext upgrade) and issues a 24h JWT embedding `{ id, email, role, isDemo }`.
- **Input:** `email`, `password`, `remember` from LoginPage.
- **Stop Condition:** Backend responds `200 OK` with the account document (password stripped), `token`, `isDemo`, `accountCategory`.
- **Validation:** Token stored via `setAuthToken(token, remember)` under key `yto_token`; 401 on bad credentials; 403 on Deactivated.

### Step 4: Demo Login Path (Demo Accounts)

- **Action:** The three canonical demo admins log in through the same endpoint with their env-sourced passwords (`DEMO_ADMIN_PASSWORD_SUPERADMIN/_STAFF/_HUB`); `isDemoEmail()` classifies them DEMO regardless of the gmail domain.
- **Input:** Demo admin email + `DEMO_ADMIN_PASSWORD_*` value.
- **Stop Condition:** JWT issued with `isDemo: true`; demo realms default their category filters to DEMO.
- **Validation:** `currentUser.isDemo: true`; `[DEMO MODE]` fixtures permitted; real-realm data stays partitioned by `getCategoryFilter`.

### Step 5: Session Finalization

- **Action:** Record token + account in top-level state; navigate to the dashboard view via `PAGE_MAP` in `App.jsx`.
- **Input:** Authenticated session data from Steps 3 or 4.
- **Stop Condition:** User positioned on the AnalyticsDashboard; every routed page wrapped in `ErrorBoundary`.
- **Validation:** No cross-role leakage; all subsequent API calls carry the Bearer token and are realm-scoped server-side by `getCategoryFilter`.

## 4. Output Specification

```json
{
  "module": "authentication-skill",
  "status": "authenticated",
  "isDemo": true/false,
  "accountCategory": "REAL|DEMO",
  "role": "super_admin|staff|hub_receiver",
  "jwtToken": "<raw JWT, stored under yto_token>",
  "tokenStorage": "localStorage (remember=true) | sessionStorage (remember=false)"
}
```

## 5. Validation Gate

- [ ] Email normalized: `.toLowerCase().trim()`
- [ ] Phone sanitized: `.replaceAll("[^0-9]", "")`
- [ ] `isDemoEmail()` evaluated correctly: exact allowlist `superadmin@gmail.com`/`staff@gmail.com`/`hub@gmail.com`, domains `yto.com`/`example.com`/`ytoexpress.com`, or `demo` prefix — every other gmail address stays REAL
- [ ] Login dispatched to `POST /api/accounts/login` (the Web Admin has no OTP endpoints)
- [ ] Deactivated accounts rejected with 403
- [ ] No cross-role leakage: server-side realm scoping via `getCategoryFilter`
- [ ] Emoji-free validation: Input contains no emoji characters
- [ ] JWT token stored under key `yto_token` (`localStorage` when remember-me, otherwise `sessionStorage`; session storage wins on read)
- [ ] `currentUser.isDemo` propagated to all child components via props from `App.jsx`

## 6. Anti-Triggers and Calibration

- **Over-execution:** Running full OTP verification flow for auto-filled session credentials (use silent refresh instead).
- **Under-execution:** Skipping `isDemo` gate and directly accessing live REST API with demo email → causes 404 errors and mock data leakage.
- **Calibration default:** Trigger only when email input length > 5 AND format contains `@` AND domain not previously cached.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Normalize) | AP-1 (vague task verb) | Coherent email format required before OTP dispatch. |
| 2 (Classify) | AP-11 (forgotten context) | `isDemo` evaluated before any data fetch; context never silently dropped. |
| 3 (Live Login) | AP-45 (no human review trigger) | Confirm Mode gates high-stakes execution; credentials must come from the user, never source code. |
| 4 (Demo Login) | AP-29 (ambiguous verb) | Recognized demo logins/domains deterministically mapped; no guessing. |
| 5 (Finalize) | AP-2 (two tasks in one prompt) | Authentication completed before dashboard navigation; split into separate workflow. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `Loginpage.jsx`, `App.jsx`, `api.js`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "User attempts to login with email `superadmin@gmail.com` and the `DEMO_ADMIN_PASSWORD_SUPERADMIN` value."

**Output:** "Taking from this: demo admin authentication. Constraints: `POST /api/accounts/login`; JWT embeds `isDemo: true`; token stored per remember-me choice. Proceeding with login flow."

**Failure case:** The user pastes a demo email (`rider@yto.com`) but the agent attempts an OTP flow → `/api/auth/*` does not exist on the Web backend. Refuse: the Web Admin authenticates only via `POST /api/accounts/login`.