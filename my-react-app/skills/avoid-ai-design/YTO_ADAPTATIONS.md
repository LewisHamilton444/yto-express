# YTO Adaptations to avoid-ai-design

This file records how `avoid-ai-design` is applied inside the YTO Express Web Admin and where this project's established design system outranks the skill's defaults. The skill itself mandates this via its Guardrails ("An existing design system, brand guidelines, or a named framework outranks your taste") and its `inside-design-system` profile ("Surgical only. Respect existing tokens and primitives. Do not fight the system"). Every exception below is intentional, mirroring `skills/no-slop-ui/YTO_ADAPTATIONS.md`.

## Relationship to no-slop-ui (precedence)

- `no-slop-ui` + `YTO_ADAPTATIONS.md` remain the **build-time guardrail**: read before making any visual, layout, or styling change (AGENTS2.md §2).
- `avoid-ai-design` is the **audit/rewrite pass**: use it when explicitly asked to audit a screen or component for AI-design tells, de-slop existing output, or as the post-build audit of generated frontend (its `detect` mode fits reviewing code you should not change).
- When a rewrite conflicts with `no-slop-ui` rules or this file's tokens, the `no-slop-ui` chain wins; flag the difference as advice (the skill's `inside-design-system` behavior), never silently fight it.

## Brand tokens are decisions, not tells

The skill's own philosophy: "a purple gradient is not bad because purple is bad; it is bad because no one chose it." In this repo, these colors **were chosen** and are the corporate identity (YTO logo):

- Brand purple `#390955` and brand orange `#f37021` — defined in `src/tailwind.css` `@theme` as `--color-brand-purple` / `--color-brand-orange` (plus `brand-purple-dark #2a0640` and the `brand-purple-50..300` ramp).
- Brand orange is the **active/selection color** across all interactive chrome (sidebar active item `#f37021`, `.ad-sidebar-nav-item--active`, collapse-btn hover). It is not an unselected default and must survive any rewrite.
- Any audit flag on these tokens is a judgment call to dismiss, not a P0/P1 tell — unless they appear in a genuinely un-branded context the tokens were never designed for.

## Already-compliant areas (skip re-flagging)

| Skill tell | This repo's state |
|---|---|
| Emoji/text glyphs as icons | Banned project-wide (AGENTS2.md icon rule); `lucide-react` SVGs only with `aria-label` on icon-only buttons. **Note:** a `lucide` import is listed as a tell in `references/ai-tells-catalog.md` — in this repo it is the mandated icon system, never a tell. |
| Font defaults (Inter/Roboto/Arial) | Covered by `no-slop-ui/YTO_ADAPTATIONS.md` ESCALATE 1: `Segoe UI` is the app font; Arial survives only in generated print/export stylesheets. |
| Radius drift | Covered by the border-radius convention in `no-slop-ui/YTO_ADAPTATIONS.md`: 12px cards/modals, 8px controls/chips; login card waived. |
| Status colors inline | Status palettes are centralized in `src/components/ui/statusColors.js` (`PARCEL_STATUS_COLORS`, `SELLER_STATUS_COLORS`, `RIDER_STATUS_COLORS`, `ACCOUNT_CATEGORY_TONE`); new colors extend the map — never inline hex. |
| Simulated data honesty | `SimulatedFeedBadge` on demo/simulated feeds; demo fixtures (`FALLBACK_PARCELS`, `MOCK_ACCOUNTS`, `mockRiders`/`mockSellers`) carry the `[DEMO MODE]` banner — do not "fix" them as fake-data tells; they are intentional labeled fixtures. |

## Profile calibration

| Screen | Profile |
|---|---|
| `LoginPage` (hero + glass card) | `landing` strength, but the glass card is already waived (ESCALATE 2) — audits may flag nothing here by default |
| `AnalyticsDashboard`, sidebar, `GlobalHeader` | `dashboard` — density, legibility, hierarchy over decoration |
| Every internal page (ManageParcels, MonitorRiderStatus, ...) | `inside-design-system` — surgical; respect existing tokens (`statusColors.js`, `components/ui/*`, Tailwind `brand-*`) |
| `examples/demo/*` | Self-reference escape hatch — illustrative slop in the skill's own worked example is intentional |

## Modes

- Default `rewrite` only on explicitly requested de-slop tasks; the pause point ("show the direction plus one or two alternatives and pause") maps to this project's confirm-before-visual-change convention.
- `detect` mode for audits of untouched legacy screens, dependency components, or teammate work — flag only, no edits.

## Going forward

- New UI follows `no-slop-ui` first; run an `avoid-ai-design` audit pass when a screen reads as generic AI output or on request ("de-slop", "just audit").
- Any new deviation from this skill gets recorded here, in the same format as the `no-slop-ui` adaptations file.
