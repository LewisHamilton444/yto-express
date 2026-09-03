# Stress fixtures (opt-in)

A permanent adversarial dataset: every collection carries at least one row
with null/missing/malformed fields (null status, unit-suffixed weights,
lowercase statuses, null GPS/recipient/package, legacy records missing the
standard fields). This is the closest stand-in for hostile real data until
sanitized MongoDB exports are dropped into `scripts/qa/fixtures/`.

Run the sweep against them (from `my-react-app/`):

```bash
# bash / Git Bash
QA_FIXTURES_DIR=scripts/qa/fixtures-stress npm run qa:layout

# Windows cmd
set QA_FIXTURES_DIR=scripts/qa/fixtures-stress&& npm run qa:layout
```

A clean pass means no page crashes, overflows, clipped panes, console
errors, or broken action clicks even when records are half-formed. Any
`CRASH` / `ERR` / `INT-ERR` flag here is a genuine null-tolerance bug in a
page's row rendering — fix the page, don't water down the fixture.
