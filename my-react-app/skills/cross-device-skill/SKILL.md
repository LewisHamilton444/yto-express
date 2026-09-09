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
- **Normative base:** `AGENTS2.md`; `src/services/useSSE.js`; `src/GlobalHeader.jsx`; `src/components/NotificationBell.jsx`.

## 1. Intent (9 Dimensions)

| # | Dimension | Value |
|---|-----------|-------|
| 1 | Task | Manage real-time admin-portal updates via SSE (`useSSE` hook): re-fetch events, badge updates, and live-feed status pill. |
| 2 | Target Tool | Any React agent runtime: Cline, Copilot, Studio Bot, raw API. |
| 3 | Output Format | Structured readback with `connected`, `mode` (`sse`/`polling`), `lastEvent`, and listener registrations. |
| 4 | Constraints | SSE connects to `/api/events/stream?token=<JWT>` (query param — EventSource cannot set headers); auto-reconnect 3s; after 5 failures falls back to 5s HTTP polling of `/api/activity-log?limit=10`; the `'offline'` mode value exists but is never set (polling retries indefinitely). |
| 5 | Input | JWT token via `getAuthToken()` (key `yto_token`); event types `user-synced`, `parcel-synced`, `location-synced`, `parcel-updated`, `peak-alert`. |
| 6 | Context | All subscribed views (dashboards, ManageParcels, map views) re-fetch on `lastEvent` changes; `GlobalHeader` renders the Live/Polling/Offline pill from `mode`. |
| 7 | Audience | Active session user; GlobalHeader; NotificationBell; data views. |
| 8 | Success Criteria | SSE events dispatched to listeners; unread badge updated; live-feed pill reflects the connection mode. |
| 9 | Examples | SSE receives `parcel-synced` → views listening via `on('parcel-synced', cb)` re-fetch. Peak connections exceeded → `peak-alert` event. |

## 2. Trigger Matrix

| Scenario | Decision | Action |
|----------|----------|--------|
| User navigates to any view (GlobalHeader is mounted app-wide) | YES | `useSSE()` connects to `/api/events/stream?token=<JWT>`; auto-reconnect every 3s; after 5 failed attempts fall back to 5s HTTP polling. |
| SSE connection drops or times out | YES | Reconnect after 3s (fixed delay, up to 5 attempts) then switch to polling; header pill switches to `Polling`. |
| Polling also fails | YES | Polling continues retrying every 5s — the `'offline'` mode is defined in the state union but never set; the header renders Offline via its `modeConfig` fallback only. |
| User logs out or token expires | YES | `apiFetch` clears `yto_token` (local + session storage) and dispatches `yto:auth_expired`; `App.jsx` returns to `LoginPage`. |
| Manual retry (header pill button) | YES | `retry()` resets the attempt counter, stops polling, and reconnects SSE immediately. |

## 3. Execution Workflow

### Step 1: Initialize SSE Connection

- **Action:** Construct `EventSource` with URL `/api/events/stream?token=<JWT>` (SSE cannot set custom headers, so the token is passed as a query parameter).
- **Input:** JWT token via `getAuthToken()` (key `yto_token`, session or local storage); `currentUser.isDemo` flag.
- **Stop Condition:** `readyState` becomes `open`; message listener attached.

### Step 2: Attach Message Handler

- **Action:** On message, parse JSON payload; check `eventType` field; dispatch appropriate action based on type.
- **Input:** Message data from SSE stream.
- **Stop Condition:** `eventType` identified (`issue-synced`, `issue-status-updated`, `parcel-synced`, `refreshed-logistics`).

### Step 3: Route Event to Subscribed Views

- **Action:** Based on event type, call the matching listener registered via `on(eventType, cb)`; views re-fetch their collections.
- **Input:** Event type and data payload.
- **Stop Condition:** Subscribed views updated (e.g., ManageParcels re-fetches on `parcel-synced`/`parcel-updated`).

### Step 4: Update Unread Badge

- **Action:** Increment/decrement unread count based on event; update the `NotificationBell` badge.
- **Input:** Event payload relevant to pending items.
- **Stop Condition:** Badge reflects an accurate unread count.

### Step 5: Toast for Critical Events

- **Action:** For high-priority events, surface feedback through the global `ToastContext` provider (the Web replacement for the Android heads-up banner).
- **Input:** Event data with relevant message content.
- **Stop Condition:** Toast rendered via `useToasts()`/`ToastContext`; auto-dismisses per provider timing.

### Step 6: Cleanup on Unmount

- **Action:** On component unmount, close `EventSource`; remove message listeners; emit `'yto:sse_cleanup'` to prevent memory leaks.
- **Input:** None (component lifecycle event).
- **Stop Condition:** `EventSource.close()` called; no pending listeners.

## 4. Output Specification

```json
{
  "module": "cross-device-skill",
  "status": "subscribed",
  "connected": true/false,
  "mode": "sse|polling",
  "lastEvent": { "type": "parcel-synced", "data": {}, "timestamp": 0 },
  "listenerCount": number
}
```

## 5. Validation Gate

- [ ] JWT token present under key `yto_token` (session or local storage)
- [ ] SSE endpoint `/api/events/stream?token=<JWT>` returns a valid `text/event-stream`
- [ ] Fallback polling interval exactly 5s (`setInterval` with 5000ms) after 5 failed SSE attempts; polling hits `/api/activity-log?limit=10`
- [ ] Real-time events dispatched to subscribed listeners on each update
- [ ] Header pill reflects mode: `Live` (sse) / `Polling` (polling) / `Offline` fallback
- [ ] SSE `close()` called on component unmount; polling interval cleared

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
| Vite React | verified | Executed in current workspace; integrates with `useSSE.js`, `GlobalHeader.jsx`, `NotificationBell.jsx`. |
| Claude Code | untested | |
| Cursor | untested | |
| Copilot | untested | |
| Windsurf | untested | |
| Kiro | untested | |
| Cline | untested | |

## 10. Examples

**Input:** "Admin opens ManageParcels and expects real-time parcel updates."

**Output:** "Taking from this: SSE subscription via `useSSE`. Constraints: `/api/events/stream?token=<JWT>`; 3s reconnect with 5s polling fallback; views re-fetch on `parcel-synced`/`parcel-updated`. Proceeding with SSE subscription."

**Failure case:** The agent starts SSE connection before user logs in (no JWT token) → connection refused and 401 error. Refuse: trigger matrix requires `isLoggedIn == true` first.