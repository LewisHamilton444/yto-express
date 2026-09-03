---
name: notifications-skill
description: Handles notification bell, heads-up banners, and polling service for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Notifications Skill

## 0. Identity

- **Role:** Notification center and heads-up banner manager
- **Authority:** Tier-2 normative root skill for `skills/notifications-skill/`.
- **Must not define:** Missing `YTO_HEADS_UP_BANNER` tag cleanup; polling service not running its SSE/long-poll cycle; badge z-order below bell card.
- **Normative base:** `AGENTS2.md`; `src/components/NotificationBell.jsx`; `src/services/YTOCrossDeviceService.js`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Manage notification bell interactions; show heads-up banners for critical events; polling service auto-refreshes dashboard fragments. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `unreadCount`, `lastHeadsUp`, `badgeZOrder`, and `pollInterval`. |
| 4 | Constraints | Channel ID: `yto_express_logistics_v2`; `IMPORTANCE_HIGH`, `VISIBILITY_PUBLIC`; vibration `new long[]{0, 500, 250, 500}`; heads-up cleanup by tag `YTO_HEADS_UP_BANNER` before new banner. |
| 5 | Input | Click event on `NotificationBell`; `showHeadsUp()` payload; `currentUser.isDemo` flag. |
| 6 | Context | One call wires click → `NotificationActivity` + binds unread badge; all dashboard fragments subscribed to `REFRESH_LOGISTICS` broadcast. |
| 7 | Audience | Active session user; Header view; Dashboard fragments; Notification bell component. |
| 8 | Success Criteria | Bell click redirects to `NotificationActivity`; unread badge displays count; heads-up banner animates for critical events; real-time updates refresh views (SSE; 5s polling fallback). |
| 9 | Examples | Bell click → open `NotificationActivity` with unread tickets/parcels. Heads-up banner for `issue-status-updated` → auto-dismiss after 5s. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| User clicks `NotificationBell` component | YES | Redirect to `NotificationActivity`; bind unread badge; emit `'yto:bell_click'` to top-level state. |
| New real-time event received (SSE or polling fallback) | YES | Dispatch to subscribed views; update unread count; refresh affected tables. |
| `currentUser.isDemo == true` | YES | Subscribe to mock notification feed with pre-populated demo events; skip live polling. |
| Heads-up banner already showing (tag `YTO_HEADS_UP_BANNER`) | YES | Cleanup existing banner by same tag; animate new banner; prevent stackup. |
| Token expires or `isLoggedIn == false` | YES | Stop polling; clear `localStorage`; redirect to `Loginpage.jsx`. |

## 3. Execution Workflow

### Step 1: Bind Notification Bell

- **Action:** Call `HeaderViewUtils.bindNotificationBell(root, hostActivity)` — one call wires click → `NotificationActivity` + binds unread badge.
- **Input:** `root` DOM element; `hostActivity` reference.
- **Stop Condition:** Click listener attached; badge state bound to `localStorage` or context; `elevation=6dp` + `translationZ=6dp` ensures z-order above bell card.

### Step 2: Handle Bell Click

- **Action:** On bell click, redirect user to `NotificationActivity`; pass `unreadCount` via navigation params; reset badge to 0.
- **Input:** `unreadCount` from state; navigation params.
- **Stop Condition:** User navigated to `NotificationActivity`; badge reset to 0; `localStorage.removeItem('yto_unread_count')`.

### Step 3: Subscribe to Polling Service

- **Action:** Connect SSE via `useSSE` (`/api/events/stream?token=<JWT>`); auto-reconnect every 3s; after 5 failed attempts fall back to 5s HTTP polling.
- **Input:** JWT token via `getAuthToken()` (key `yto_token`); `currentUser.isDemo` flag.
- **Stop Condition:** SSE connected (mode `'sse'`); on repeated failure switches to `'polling'` at 5000ms; both modes emit `lastEvent` for subscribers.

### Step 4: Show Heads-Up Banner for Critical Events

- **Action:** For events with `priority: high` (`issue-status-updated`, `parcel-synced`): call `showHeadsUp()` with tag `YTO_HEADS_UP_BANNER`; cleanup existing views by same tag first; animate new banner with vibration.
- **Input:** `title`, `body`, `actionText`, `priority` from event payload.
- **Stop Condition:** Heads-up banner animates in; vibration `new long[]{0, 500, 250, 500}`; auto-dismisses after 5s; `elevation=6dp` + `translationZ=6dp` always renders above bell card.

### Step 5: Cleanup on Unmount/Logout

- **Action:** On component unmount or user logout: close polling service; remove message listeners; clear `localStorage` badge state; emit `'yto:sse_cleanup'`.
- **Input:** Lifecycle event (unmount/logout).
- **Stop Condition:** Service stopped; no pending listeners; badge cleared; user redirected if logout.

## 4. Output Specification

```json
{
  "module": "notifications-skill",
  "status": "subscribed",
  "unreadCount": number,
  "lastHeadsUp": "ISO_timestamp_or_null",
  "badgeZOrder": "elevation=6dp + translationZ=6dp",
  "pollInterval": 5000
}
```

## 5. Validation Gate

- [ ] Channel ID exactly `yto_express_logistics_v2`
- [ ] Importance `IMPORTANCE_HIGH` and Visibility `VISIBILITY_PUBLIC` set correctly
- [ ] Vibration pattern `new long[]{0, 500, 250, 500}` configured
- [ ] `bindNotificationBell` called exactly once per host activity; cleanup on unmount
- [ ] Fallback polling interval exactly 5s (`setInterval` with 5000ms)
- [ ] `REFRESH_LOGISTICS` broadcast dispatched on each successful poll
- [ ] Heads-up banner cleanup by tag `YTO_HEADS_UP_BANNER` before new banner animates
- [ ] Badge z-order: `elevation=6dp` + `translationZ=6dp` always renders above bell card
- [ ] Token expiry stops polling and clears `localStorage`

## 6. Anti-Triggers and Calibration

- **Over-execution:** Starting polling service before user authentication (must have valid JWT token first).
- **Under-execution:** Forgetting to cleanup existing heads-up banner by tag → banner stackup and z-order issues.
- **Calibration default:** SSE reconnect every 3s (max 5 attempts); fallback polling fixed at 5s; adjustable only via full skill rewrite.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Bind Bell) | AP-11 (forgotten context) | `bindNotificationBell` one-call wiring; context of `hostActivity` preserved; no duplicate bindings. |
| 2 (Bell Click) | AP-1 (vague task verb) | Explicit redirect to `NotificationActivity`; navigation params passed; no ambiguous routing. |
| 3 (Polling Service) | AP-2 (two tasks in one prompt) | Service startup separate from bell click; authentication completed first. |
| 4 (Heads-Up Banner) | AP-29 (ambiguous verb) | Recognized event types deterministically mapped; no guessing which events show banner. |
| 5 (Cleanup) | AP-45 (no human review trigger) | Cleanup on unmount/logout mandatory; no lingering listeners or services. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `NotificationBell.jsx`, `useSSE.js`, `HeaderViewUtils`, `YTOCrossDeviceService`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "User clicks the notification bell icon in the header to check unread alerts."

**Output:** "Taking from this: notification bell click handler. Constraints: redirect to `NotificationActivity`; bind unread badge; reset badge to 0 after navigation. Proceeding with bell click handling."

**Failure case:** The agent starts the polling service before user logs in (no JWT token) → service fails to connect and 401 error. Refuse: trigger matrix requires `isLoggedIn == true` and valid token first.