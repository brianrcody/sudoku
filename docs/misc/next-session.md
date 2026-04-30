# Next Session — v1 Sign-Off Tasks

Phase 4 is shipped (commits `b1cce29`, `34dfe73`). Deployed site verified
working after the WORKER_URL fix. Three iteration-exit-criteria items
remain before v1 can close.

## 1. Branch coverage — verify 100%

Per CLAUDE.md, the bar is **100% branch coverage**.

```sh
npm test                                       # generates coverage/coverage.json
npx c8 report --reporter=text --reporter=html  # human-readable summary
```

The test runner (`test-runner/run.js`) writes V8 coverage to
`coverage/coverage.json` after each run; `c8 report` consumes it.

**Caveat (from tspec §4.2):** Playwright's `page.coverage` API only
captures the main frame, so the generator Worker is excluded. Worker
code is exercised by direct-import unit tests
(`js/tests/integration/worker.test.js` etc.). When evaluating coverage,
note any worker-exclusive branches and confirm they're covered by the
direct-import tests rather than worried about gaps in the V8 report.

## 2. Performance — sub-1 s user actions

CLAUDE.md performance threshold: every user-facing action under 1 s.

Spot-check the obvious ones with the existing system tests as a
starting point, plus manual timing for anything not covered:

- New Puzzle (each tier, including death-march)
- Reset Puzzle
- Pen entry → conflict highlight
- Hint
- Check
- Difficulty change

Use `performance.now()` around dispatches in the browser console, or
extend `js/tests/integration/system.test.js` if anything looks
borderline. SYS3 already exercises death-march cold-start within 5 s
(noted as the worst case in the aspec).

## 3. UX milestone approval — user-driven

Per CLAUDE.md "UX Quality": the user reviews and approves UX at each
milestone boundary. This is the v1 milestone. Tasks for that review
sit with the Product Director, not the orchestrator.

## Quick orientation pointers

- Worker URL was the bug behind the "New Puzzle stopped responding"
  symptom. Fix in `js/config.js:69-75` (commit `34dfe73`). See
  `feedback_module_relative_urls.md` in memory for the lesson.
- `coverage/` is now in `.gitignore`.
- `docs/misc/phase4-fixes.md` is the triage record from the QE Test
  Runner; useful as historical context but not required reading.
