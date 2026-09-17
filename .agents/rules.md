# Project Agent Rules & Caveman Integration

This project uses the standard `.agents/` specification.

## Active Skills
- Caveman suite located in `.agents/skills/caveman/`.
- When Caveman mode is active (`/caveman`), adhere strictly to `SKILL.md` compression directives.

## Universal Project Invariants
1. Evidence-first verification: Inspect files and gather concrete proof before asserting claims.
2. Build verification: Always run build checks (`npm run build`) before completing tasks.
3. No emojis: Do not use emojis in code, UI strings, log messages, or comments.
4. Auto-clarity: Drop terse mode immediately for security warnings, destructive actions, or critical user confirmations.
