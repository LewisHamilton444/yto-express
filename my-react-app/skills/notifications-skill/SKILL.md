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
- **Normative base:** `AGENTS2.md`; `src/components/NotificationBell.jsx`; `src/services/useSSE.js`; `src/GlobalHeader.jsx`. NOTE: there is no `YTOCrossDeviceService.js` on the Web — that is the Android foreground service; the Web equivalent is the `useSSE` hook.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Manage the header `NotificationBell` (pending-approvals badge, navigable popover) and surface real-time events via SSE with 5s polling fallback; critical feedback uses the global `ToastContext`, not Android-style heads-up banners. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `pendingCount`, `lastEvent`, `mode`, and toast dispatch state. |
| 4 | Constraints | The Android channel config (`yto_express_logistics_v2`, vibration, `YTO_HEADS_UP_BANNER` tag) does NOT apply to the Web — the Web has no system notification channel; browser notifications exist only inside `useSSE` (opt-in permission, per-event tags). |
| 5 | Input | Click event on `NotificationBell`; SSE/polling events from `useSSE`; `currentUser.isDemo` flag. |
| 6 | Context | `GlobalHeader` mounts the bell app-wide; SSE events (`parcel-synced`, `issue-synced`, ...) drive badge counts and toasts; views re-fetch on `lastEvent` changes. |
| 7 | Audience | Active session user; GlobalHeader; data views. |
| 8 | Success Criteria | Bell badge reflects pending count; bell click navigates per `onNavigate`; toasts surface critical events; live updates flow via SSE with polling fallback. |
| 9 | Examples | SSE `issue-status-updated` → toast via `ToastContext`; bell badge shows pending rider/seller approvals. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| User clicks `NotificationBell` component | YES | Open the bell popover / navigate per `onNavigate`; reset unread badge state. |
| New real-time event received (SSE or polling fallback) | YES | Dispatch to subscribed views; update pending badge; refresh affected tables. |
| Critical event arrives | YES | Surface a toast via the global `ToastContext` provider. |
| Token expires or session invalid | YES | `apiFetch` clears `yto_token` and dispatches `yto:auth_expired`; `App.jsx` returns to `LoginPage`. |

## 3. Execution Workflow

### Step 1: Mount Notification Bell

- **Action:** Render `NotificationBell` inside `GlobalHeader` with `riders`, `pendingCount`, and `onNavigate` props.
- **Input:** Pending registration/rider counts; navigation handler from the routed view.
- **Stop Condition:** Bell visible with an accurate badge; popover opens on click.

### Step 2: Handle Bell Click

- **Action:** On bell click, open the popover (pending approvals) or navigate to the relevant view via `onNavigate`.
- **Input:** `pendingCount`; `onNavigate` callback.
- **Stop Condition:** User lands on the relevant view (e.g., ProcessSellerInformation / ProcessRiderInformation).

### Step 3: Subscribe to Polling Service

- **Action:** Connect SSE via `useSSE` (`/api/events/stream?token=<JWT>`); auto-reconnect every 3s; after 5 failed attempts fall back to 5s HTTP polling.
- **Input:** JWT token via `getAuthToken()` (key `yto_token`); `currentUser.isDemo` flag.
- **Stop Condition:** SSE connected (mode `'sse'`); on repeated failure switches to `'polling'` at 5000ms; both modes emit `lastEvent` for subscribers.

### Step 4: Toast for Critical Events

- **Action:** For critical events (`issue-status-updated`, `parcel-synced`): push a toast through `ToastContext`.
- **Input:** Event payload from `lastEvent`.
- **Stop Condition:** Toast rendered and auto-dismissed per provider timing; no stacking artifacts.

### Step 5: Cleanup on Unmount/Logout

- **Action:** On unmount or logout: close the `EventSource`, stop polling, remove listeners, clear badge state.
- **Input:** Lifecycle event (unmount/logout).
- **Stop Condition:** No pending listeners or intervals; user redirected if logout.

## 4. Output Specification

```json
{
  "module": "notifications-skill",
  "status": "subscribed",
  "pendingCount": number,
  "lastEvent": { "type": "issue-status-updated", "data": {}, "timestamp": 0 },
  "mode": "sse|polling",
  "toastDispatched": true/false
}
```

## 5. Validation Gate

- [ ] `NotificationBell` rendered once inside `GlobalHeader` with live pending counts
- [ ] Critical events surfaced via `ToastContext` (no Android heads-up banners on the Web)
- [ ] SSE subscription via `useSSE`; fallback polling interval exactly 5s
- [ ] Views re-fetch on relevant `lastEvent` changes
- [ ] Token expiry stops polling/SSE and clears `yto_token`

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
| Vite React | verified | Executed in current workspace; integrates with `NotificationBell.jsx`, `useSSE.js`, `GlobalHeader.jsx`, `ToastContext`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "User clicks the notification bell icon in the header to check pending approvals."

**Output:** "Taking from this: notification bell click handler. Constraints: open the bell popover / navigate via `onNavigate`; badge reflects pending counts from live data. Proceeding with bell click handling."

**Failure case:** The agent starts SSE before user logs in (no JWT token) → connection fails and `apiFetch` 401 handling clears storage. Refuse: SSE subscription requires a valid `yto_token` first.