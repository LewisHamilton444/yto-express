---
name: caveman-commit
description: >-
  Generates ultra-concise, high-density conventional git commit messages based on
  staged changes or working tree diffs without conversational explanation.
---

# Caveman Commit Generator

Inspect diff. Output only valid conventional commit. Zero commentary before or after.

## Directives

1. Inspect staged changes with git status/diff.
2. Determine conventional commit prefix: `feat:`, `fix:`, `refactor:`, `perf:`, `test:`, `chore:`.
3. First line under 72 characters, imperative present tense, no period.
4. Optional bulleted body: list root changes, drop articles, keep file names exact.
5. Zero pleasantries. Output commit block directly.

## Example Output

```gitcommit
fix(auth): correct token expiration operator

- replace `<` with `<=` in AuthMiddleware
- prevent premature session invalidation on boundary timestamp
```
