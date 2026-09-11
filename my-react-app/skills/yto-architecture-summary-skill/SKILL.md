---
name: yto-architecture-summary-skill
description: Catalog and layered architecture summary of the YTO Express Web Admin skills set, bridge protocol, and rendering stack.
version: 1.0.0
verified-on: [vite]
---

# YTO Express Web Admin - Skills Catalog Summary

## Overview

This catalog adapts the same `agent-spec-main` framework structure used by the YTO Express Android catalog for the **YTO Express Web Admin portal** (`my-react-app`). Every skill uses the standardized `SKILL.md` template: 9-dimension intent, trigger matrix, 5-step execution workflow, validation gate, and anti-pattern compliance map.

The Web Admin is not a mirror of the mobile app. It is the admin-side counterpart: it consumes bridge writes pushed from the Android backend, owns the MongoDB records the admin staff manage, and renders the operational views (parcels, riders, sellers, customers, issues, accounts, analytics).

## Skills Catalog

| # | Skill Name | Folder Path | Primary Function |
|---|-----------|-------------|-----------------|
| 1 | `authentication-skill` | `skills/authentication-skill/` | Admin login router: demo vs real classification, JWT session, role gates |
| 2 | `cross-device-skill` | `skills/cross-device-skill/` | Bridge + SSE protocol; admin-side refresh on mobile-originated writes |
| 3 | `geofence-delivery-skill` | `skills/geofence-delivery-skill/` | Geofence zones, hub geometry, delivery-boundary validation |
| 4 | `map-location-picker-skill` | `skills/map-location-picker-skill/` | Leaflet map picker, coordinate resolution, Luzon city lookup |
| 5 | `notifications-skill` | `skills/notifications-skill/` | Admin notification center, bell badge, scoped alerts |
| 6 | `package-booking-skill` | `skills/package-booking-skill/` | Admin parcel creation, waybill generation, bridge `sync-parcel` |
| 7 | `profile-management-skill` | `skills/profile-management-skill/` | Admin account/profile management, saved preferences |
| 8 | `rider-delivery-skill` | `skills/rider-delivery-skill/` | Rider ledger, live GPS monitoring, delivery lifecycle |
| 9 | `seller-dashboard-skill` | `skills/seller-dashboard-skill/` | Seller ledger, archive/restore lifecycle, seller analytics |
| 10 | `shipment-tracking-skill` | `skills/shipment-tracking-skill/` | 5-stage progress timeline, hub receiving, parcel-location ledger, SSE live updates |
| 11 | `yto-architecture-summary-skill` | `skills/yto-architecture-summary-skill/` | This catalog - summarizes all adapted Web skills |

## Layered Architecture

### Rendering Layer (`src/`)

- **Shell:** `App.jsx` composes the sidebar layout, route switching, and the global `ToastProvider`.
- **Screens:** one top-level `.jsx` per admin page (ManageParcels, MonitorParcel, MonitorRiderStatus, ViewSeller, ManageAccounts, Settings, AnalyticsDashboard, ...).
- **Shared UI:** `src/components/ui/` owns the cross-screen primitives - `ToastContext.jsx` + `useToast.js`, `StatusBadge`, `Modal`, `EmptyState`, `TableSkeleton`, `Tooltip`, `PaginationControls`.
- **Status vocabulary:** `src/components/ui/statusColors.js` is the single source of truth for parcel / seller / rider status colors.

### Data Layer

- **Client transport:** `src/services/api.js` (`apiFetch` + domain helpers), `src/services/useSSE.js` (EventSource with polling fallback).
- **Server:** `server/Server.js` (Express 5) mounts the `/api/*` routes; `server/bridgeRoutes.js` mounts `/api/bridge/*`; `server/models/` holds the Mongoose schemas.

### Bridge Layer (App -> Web)

- Mobile-originated writes arrive at `/api/bridge/*`: `sync-user`, `sync-parcel`, `sync-issue`, `sync-location`, `receive-status`, `receive-issue-status`, plus `health`.
- Admin-originated edits flow back out through the same bridge plus SSE broadcast, so both surfaces converge without a shared database connection.

## Cross-Cutting Themes

1. **Demo vs. Real isolation** - admin screens branch on the demo flag; demo surfaces show clearly-labelled fixture rows, real surfaces show strict clean empty states.
2. **Bridge is the contract** - the Android app and the Web Admin never share a live connection; `trackingNumber` is the upsert key and partial-update merges are expected.
3. **SSE over polling** - `GET /api/events/stream` is the primary update transport; HTTP polling is the documented fallback after repeated SSE failures.
4. **Shared status vocabulary** - statuses and their colors are centralized; screens extend the map rather than inlining hex.
5. **No emojis** - never in UI strings, log messages, or code comments.
6. **Verification gate** - every Web change ends with `npx eslint .` and `vite build` green.

## Usage

1. Read the target skill's `SKILL.md` for the full specification.
2. Follow its validation gate before implementing.
3. Observe the `must not define` boundaries.
4. Reference the normative base (`AGENTS2.md` plus the named source files).
5. Verify with `npx eslint .` (expect 0 errors, 0 warnings) and `vite build` (expect a successful emit).

## Integration With the Project

These skills do not replace the Web Admin codebase. They serve as formal feature specifications, a process standardizer for the team, onboarding material for new developers, structured prompts for AI-assisted development, and an audit framework for `AGENTS2.md` compliance.

---

*Generated using the `agent-spec-main` framework structure adapted for the YTO Express Web Admin portal.*