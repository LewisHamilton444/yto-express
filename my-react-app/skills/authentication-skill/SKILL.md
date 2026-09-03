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
| 1 | Task | Route login attempts to live OTP verification (real `@gmail.com` accounts) or fast-path demo bypass (`@yto.com`, `@example.com`). |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `targetUserId`, `targetRole`, `isDemoUser` flag, and OTP code synchronization status. |
| 4 | Constraints | Real accounts MUST complete `POST /api/auth/verify-otp` with `isVerified: true` before app entry. Demo accounts use instant local bypass. |
| 5 | Input | Email + password credentials; optional OTP code from user inbox. |
| 6 | Context | Prevents cross-role leakage; enforces `isDemoUser` gate before any API fetch. |
| 7 | Audience | Active session user; Loginpage.jsx; ProfileFragment; SignupActivity. |
| 8 | Success Criteria | User authenticated with valid JWT token; `currentUser.isLoggedIn: true`; role-scoped data loaded. |
| 9 | Examples | Login with `seller@gmail.com` → live OTP dispatch → MongoDB verification → app entry. Login with `rider@yto.com` → instant mock OTP → demo engine initialization. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| User enters email ending with `@gmail.com`, `@yahoo.com`, or other live domain | YES | Initiate live OTP dispatch via `POST /api/auth/send-otp`; set `isDemo: false`. |
| User enters email ending with `@yto.com` or `@example.com` | YES | Fast-path demo bypass; initialize demo state; set `isDemo: true`. |
| User enters `customer@gmail.com`, `seller@gmail.com`, `rider@gmail.com` (designated test logins) | YES | Treat as real accounts with mock OTP for testing; verify via live endpoint. |
| User enters email without `@` symbol or invalid format | NO | Reject input; show validation error; do not proceed to OTP dispatch. |
| Auto-fill populated credentials from session state | NO | Re-authenticate silently; refresh JWT token if near expiry. |

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

### Step 3: Live OTP Verification (Real Accounts)

- **Action:** Dispatch `POST /api/auth/send-otp` with normalized email; wait for 6-digit code in user's Gmail inbox; dispatch `POST /api/auth/verify-otp` with `otpCode`.
- **Input:** `otpCode` from user; `email` from Step 1; `targetRole` from session context.
- **Stop Condition:** Backend responds `200 OK` with `isVerified: true`; JWT token issued.
- **Validation:** MongoDB document updated with `isVerified: true`; `localStorage.setItem('token', token)`; `currentUser.isDemo: false`.

### Step 4: Demo Bypass (Demo Accounts)

- **Action:** Accept synchronized 6-digit OTP code without live email dispatch; initialize demo state with pre-populated mock data.
- **Input:** Mock `otpCode` from user (any 6 digits accepted).
- **Stop Condition:** OTP code validated locally; demo state seeded with sample records.
- **Validation:** `localStorage.setItem('mockToken', mockToken)`; `currentUser.isDemo: true`; clean empty states avoided (0 mock shipments only if explicitly requested).

### Step 5: Session Finalization

- **Action:** Record `targetUserId`, `targetRole`, `isDemo` in top-level state; navigate to role-appropriate dashboard via `PAGE_MAP` in `App.jsx`.
- **Input:** Authenticated session data from Steps 3 or 4.
- **Stop Condition:** User positioned on correct dashboard (CustomerDashboard, SellerDashboard, RiderDashboard).
- **Validation:** No cross-role leakage; all subsequent API calls scoped by `targetUserId` and `targetRole`.

## 4. Output Specification

```json
{
  "module": "authentication-skill",
  "status": "authenticated",
  "isDemo": true/false,
  "targetUserId": "user_object_id_or_mock_id",
  "targetRole": "CUSTOMER|SELLER|RIDER|ADMIN",
  "jwtToken": "Bearer <token>",
  "sessionRefresh": true
}
```

## 5. Validation Gate

- [ ] Email normalized: `.toLowerCase().trim()`
- [ ] Phone sanitized: `.replaceAll("[^0-9]", "")`
- [ ] `isDemoUser()` evaluated correctly: ONLY `@yto.com`, `@example.com`, `customer@gmail.com`, `seller@gmail.com`, `rider@gmail.com`
- [ ] Real accounts: `POST /api/auth/verify-otp` completed; `isVerified: true` in MongoDB
- [ ] Demo accounts: Instant local bypass; demo state initialized
- [ ] No cross-role leakage: `targetUserId` and `targetRole` scoped for all subsequent reads
- [ ] Emoji-free validation: Input contains no emoji characters (enforced by `.replaceAll("[^\\p{L}\\p{N}\\s]", "")`)
- [ ] JWT token stored under key `yto_token` (`localStorage` when remember-me, otherwise `sessionStorage`; session storage wins on read)
- [ ] `currentUser.isDemo` propagated to all child components via context

## 6. Anti-Triggers and Calibration

- **Over-execution:** Running full OTP verification flow for auto-filled session credentials (use silent refresh instead).
- **Under-execution:** Skipping `isDemo` gate and directly accessing live REST API with demo email → causes 404 errors and mock data leakage.
- **Calibration default:** Trigger only when email input length > 5 AND format contains `@` AND domain not previously cached.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Normalize) | AP-1 (vague task verb) | Coherent email format required before OTP dispatch. |
| 2 (Classify) | AP-11 (forgotten context) | `isDemo` evaluated before any data fetch; context never silently dropped. |
| 3 (Live OTP) | AP-45 (no human review trigger) | Confirm Mode gates high-stakes execution; user must manually enter OTP from inbox. |
| 4 (Demo Bypass) | AP-29 (ambiguous verb) | Recognized demo domains deterministically mapped; no guessing. |
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

**Input:** "User attempts to login with email `seller@gmail.com` and password `••••••••`."

**Output:** "Taking from this: seller role authentication with live OTP verification. Constraints: must complete `POST /api/auth/verify-otp` with `isVerified: true` before app entry. Proceeding with live verification flow."

**Failure case:** The user pastes a clean demo email (`rider@yto.com`) but the agent attempts live OTP dispatch → causes 404 error and breaks demo flow. Refuse: trigger matrix marks demo domains YES for fast-path bypass.