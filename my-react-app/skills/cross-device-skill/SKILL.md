---
name: cross-device-skill
description: Handles cross-device synchronization, SSE events, and real-time notifications for YTO Express Web App.
version: 1.0.0
verified-on: [vite]
---

# Cross-Device Synchronization Skill

## 0. Identity

- **Role:** SSE Broadcaster and Notification Router
- **Authority: Tier-3 normative root skill for `skills/cross-device-skill/`.
- **Must not define:** Missing SSE cleanup; unbound notification listeners causing memory leaks.
- **Normative base:** `AGENTS2.md`; `src/services/useSSE.js`; `src/components/NotificationBell.jsx`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Manage real-time logistics updates via SSE, broadcast `REFRESH_LOGISTICS` to all subscribed fragments. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `broadcastChannel`, `lastRefresh`, `unreadCount`, and `sessionId`. |
| 4 | Constraints | SSE connection must auto-reconnect on failure (3s, max 5 attempts); falls back to 5s HTTP polling; no unhandled errors crashing Express process. |
| 5 | Input | Bearer JWT token from `localStorage`; `currentUser.isDemo` flag; target fragment name. |
| 6 | Context | Ensures all dashboard fragments (`CustomerDashboard`, `SellerStatus`, `RiderStatus`, `MyTasks`) receive real-time updates. |
| 7 | Audience | Active session user; Dashboard fragments; HeaderViewUtils; Notification bell. |
| 8 | Success Criteria | `REFRESH_LOGISTICS` broadcast received; unread badge updated; heads-up banner displayed for critical events. |
| 9 | Examples | SSE receives `issue-synced` → toast notification opens `ManageIssues.jsx`. Rider status change → map marker updates on `LiveRiderMap.jsx`. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| User navigates to any dashboard view | YES | Subscribe to SSE stream `/api/events/stream?token=<JWT>`; auto-reconnect every 3s; after 5 failed attempts fall back to 5s HTTP polling. |
| SSE connection drops or times out | YES | Auto-reconnect after 3s exponential backoff; emit `'yto:sse_disconnected'` to UI. |
| `currentUser.isDemo == true` | YES | Subscribe to mock SSE feed with pre-populated demo events; skip live polling. |
| User logs out or token expires | YES | Clean SSE subscription; clear token under `yto_token` (local + session storage); redirect to `LoginPage.jsx`. |
| Manual refresh button clicked | YES | Force immediate re-poll of `/api/activity-log?limit=10` regardless of the fallback cycle. |

## 3. Execution Workflow

### Step 1: Initialize SSE Connection

- **Action:** Construct `EventSource` with URL `/api/events/stream?token=<JWT>` (SSE cannot set custom headers, so the token is passed as a query parameter).
- **Input:** JWT token via `getAuthToken()` (key `yto_token`, session or local storage); `currentUser.isDemo` flag.
- **Stop Condition:** `readyState` becomes `open`; message listener attached.

### Step 2: Attach Message Handler

- **Action:** On message, parse JSON payload; check `eventType` field; dispatch appropriate action based on type.
- **Input:** Message data from SSE stream.
- **Stop Condition:** `eventType` identified (`issue-synced`, `issue-status-updated`, `parcel-synced`, `refreshed-logistics`).

### Step 3: Route Event to Correct Fragment

- **Action:** Based on `eventType`, call `REFRESH_LOGISTICS` broadcast with payload; update specific fragment state.
- **Input:** Event type and data.
- **Stop Condition:** Correct fragment updated (`CustomerDashboardFragment`, `SellerStatusFragment`, `RiderStatusFragment`, `MyTasksFragment`).

### Step 4: Update Unread Badge

- **Action:** Increment/decrement unread count based on event; update `NotificationBell` component badge; persist to `localStorage`.
- **Input:** Event payload with `badgeDelta` (positive or negative integer).
- **Stop Condition:** Badge reflects accurate unread count; z-order `elevation=6dp` + `translationZ=6dp` renders above bell card.

### Step 5: Heads-Up Banner for Critical Events

- **Action:** For `issue-status-updated` or `parcel-synced` events with `priority: high`, call `showHeadsUp()` with tag `YTO_HEADS_UP_BANNER`; cleanup existing banner by same tag first.
- **Input:** Event data with `title`, `body`, `actionText`.
- **Stop Condition:** Heads-up banner animates in; auto-dismisses after 5s; vibration pattern `new long[]{0, 500, 250, 500}`.

### Step 6: Cleanup on Unmount

- **Action:** On component unmount, close `EventSource`; remove message listeners; emit `'yto:sse_cleanup'` to prevent memory leaks.
- **Input:** None (component lifecycle event).
- **Stop Condition:** `EventSource.close()` called; no pending listeners.

## 4. Output Specification

```json
{
  "module": "cross-device-skill",
  "status": "subscribed",
  "broadcastChannel": "REFRESH_LOGISTICS",
  "lastRefresh": "ISO_timestamp",
  "unreadCount": number,
  "sessionId": "user_jwt_identifier"
}
```

## 5. Validation Gate

- [ ] JWT token present under key `yto_token` (session or local storage)
- [] SSE endpoint `/api/events/stream` returns valid SSE stream
- [] `currentUser.isDemo` flag checked before live SSE/polling setup
- [] Fallback polling interval exactly 5s (`setInterval` with 5000ms) after 5 failed SSE attempts
- [] Real-time events dispatched to subscribed views on each update
- [] Unread badge updates atomically (no race conditions)
- [] Heads-up banner cleanup by tag `YTO_HEADS_UP_BANNER` before new banner animates
- [] SSE `close()` called on component unmount

## 6. Anti-Triggers and Calibration

- **Over-execution:** Starting SSE connection before user authentication complete (token must exist first).
- **Under-execution:** Forgetting to attach `ref` cleanup in SSE handler → memory leaks and stale closures.
- **Calibration default:** Trigger only when `currentUser.isLoggedIn == true` AND valid JWT token present.

## 7. Anti-Pattern Compliance

| Step | Prevents AP | Mechanism |
|------|-------------|-----------|
| 1 (Initialize) | AP-1 (vague task verb) | SSE URL constructed with explicit token and endpoint path. |
| 2 (Message Handler) | AP-11 (forgotten context) | `eventType` field identified before any state update; context never silently dropped. |
| 3 (Route Event) | AP-2 (two tasks in one prompt) | Each `eventType` handled in separate branch; authentication completed before dashboard navigation. |
| 4 (Update Badge) | AP-45 (no human review trigger) | Badge updates are atomic; user confirms via bell click → `NotificationActivity` navigation. |
| 5 (Heads-Up Banner) | AP-29 (ambiguous verb) | Recognized event types deterministically mapped; no guessing which events show banner. |

## 8. Versioning & Changelog

- **Version:** 1.0.0
- **Changelog:**
  - `1.0.0` (2026-09-01) — Initial creation; adapted from `agent-spec-main` framework; integrated with YTO Express AGENTS2.md rules.

## 9. Portability Matrix

| Runtime | Status | Notes |
|---------|--------|-------|
| Vite React | verified | Executed in current workspace; integrates with `useSSE.js`, `NotificationBell.jsx`, `HeaderViewUtils`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "User navigates to `SellerStatusFragment` and expects real-time logistics updates."

**Output:** "Taking from this: cross-device SSE subscription for seller dashboard. Constraints: SSE `/api/events/stream` with Bearer JWT token; 3s reconnect with 5s polling fallback; auto-reconnect on failure. Proceeding with SSE subscription."

**Failure case:** The agent starts SSE connection before user logs in (no JWT token) → connection refused and 401 error. Refuse: trigger matrix requires `isLoggedIn == true` first.