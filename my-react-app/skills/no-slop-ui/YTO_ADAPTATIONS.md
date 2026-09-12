# YTO Adaptations to no-slop-ui

This file records where the YTO Express Web Admin project deliberately deviates from `no-slop-ui` rules. Per the skill's own ESCALATE verdict, the repository's existing design system, product requirements, and accessibility outrank a no-slop rule. Every exception below is intentional.

## ESCALATE 1 - Font stack (`Segoe UI`)

- Rule: `SKILL.md` Hard Rules and `references/banned-patterns.md` (Typography) ban `Segoe UI`, `Trebuchet MS`, and `Arial`.
- Status: partially waived.
- `Trebuchet MS` remains banned. It is not used anywhere in this project.
- `Arial` remains banned in application UI. It appears only inside generated print/export stylesheets (`src/AnalyticsDashboard.jsx:62`, `src/ManageParcels.jsx:354` and `src/ManageParcels.jsx:549`), which are standalone documents handed to the browser print dialog, not app chrome.
- `Segoe UI` is waived. It is this project's established font stack, in place before the skill was adopted:
  - `src/index.css:8` - app-wide body font (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`).
  - `src/LoginPage.css:27` - `'DM Sans'` first, `Segoe UI` as fallback.
  - `src/ProcessParcelInformation.css:26` - `'Segoe UI'` primary.
  - `src/ManageParcelLocation.css:11`.
  - Roughly twelve inline `fontFamily` declarations across `AppNotifications.jsx`, `HubParcelReceiving.jsx`, `GenerateRiderDataReport.jsx`, `GenerateTrackingInformation.jsx`, `MonitorRiderStatus.jsx`, `MonitorParcel.jsx`, and `ManageParcels.jsx`.
- Reason: replacing the app font is a visual-identity migration, not a slop fix. Doing it as a side effect of adopting a lint skill would touch about fifteen files and change every screen, with no product requirement behind it.
- Revisit if: the project decides to standardize on a single self-hosted typeface. That decision belongs in its own scoped task.

## ESCALATE 2 - Glassmorphism on the login card

- Rule: `references/banned-patterns.md` (Components) bans glassmorphism and frosted panels.
- Location: `src/LoginPage.css:250` - `.login-card` uses `backdrop-filter: blur(18px) saturate(1.35)`, `background: rgba(255, 255, 255, 0.13)`, `border-radius: 22px`, and a `0 24px 64px` shadow.
- Status: waived for this one surface.
- Reason: the login screen is the only deliberately decorative surface in the product, and the glass card sits over a branded hero background where a solid panel reads as a broken layout rather than a restrained one.
- Not waived elsewhere: the rule still applies to every internal dashboard view. Do not introduce new glass panels.

## ESCALATE 3 - Modal overlay blur

- Rule: same glassmorphism ban.
- Locations: `src/components/ui/Modal.jsx:79` (`blur(3px)`), `src/ManageParcelLocation.css:269`, `src/ManageParcelLocation.css:562`, `src/GenerateRiderDataReport.jsx:574`, and `src/GenerateRiderDataReport.jsx:667` (`blur(4px)`).
- Status: kept, and explicitly allowed.
- Reason: these are dimming scrims behind a modal, not decorative panels. The blur separates the dialog from the page and acts as a functional depth cue, which the skill's Product Fit section supports.
- Guard: blur stays at or under 4px, and only ever on a full-screen overlay - never on a card, button, or nav surface.

## Already compliant

- `prefers-reduced-motion`: `src/index.css:15` already disables decorative animation when the OS requests it, satisfying the skill's reduced-motion checklist item.

## Border radius convention

Source rules: `SKILL.md` line 31 (cards 8-12px max), line 32 (buttons 6-10px max, no pills), `references/banned-patterns.md` line 23 (pill buttons everywhere).

- Cards and panels: 12px. Modals: 12px. Controls, buttons, chips, and badges: 8px.
- Circles stay circles: `50%` on avatars, status dots, and icon badges is correct and was left alone.
- Sweep applied 2026-09-12 across `src/`: 66 declarations in the 14-22px band were normalized (14/16/18px cards to 12px, 20px controls and chips to 8px). 23 files changed.
- Four Tailwind `rounded-2xl` card shells (Tailwind 2xl is 16px) were changed to `rounded-xl` in `src/ActivityLog.jsx:113`, `src/CustomerList.jsx:231`, `src/ManageIssues.jsx:161`, and `src/components/ui/PageHeader.jsx:14`.
- Post-sweep state: zero declarations remain in the 13-24px band outside `src/LoginPage.css`.

### 100px pill badges - kept

- `src/ManageAccounts.jsx:207`, `src/ManageAccounts.jsx:211`, `src/MonitorRiderStatus.jsx:476`, `src/verification/PendingVerificationsTable.jsx:12`, `src/verification/PendingVerificationsTable.jsx:13`, and `src/Logout.css:100`.
- The skill bans pill *buttons*, not pill *badges*. These are non-interactive, carry real state (role, demo flag, verification status), and use uppercase categorical labels, which the Typography table in `references/banned-patterns.md` explicitly permits for truly categorical labels.

### Login surface - covered by ESCALATE 2

- `src/LoginPage.css:253` (22px) and `src/LoginPage.css:710` (18px) are the login card, already waived above.
- `src/LoginPage.css:172` and `src/LoginPage.css:220` (100px) are the login health pill and role tags on the same decorative hero surface.
- No radius changes were made anywhere in `src/LoginPage.css`.

Going forward: new cards and modals use 12px, new controls and chips use 8px, badges use 8px unless they are genuinely categorical pills. Do not introduce 14px or 16px cards.
