# Test Execution Summary — Developer Mode + Puzzle Sharing (V4)

**Date:** 2026-11-13
**Final run:** **1081 passing / 0 failing / 10 pending** — three consecutive full runs,
identical results (331 new tests; the 10 pending are the pre-existing documented skips)
**Branch coverage:** 93.50% overall; all ten new modules 100% (`coverage-devmode-sharing.md`)
**Reviewer:** clean sign-off (`review-devmode-sharing-v1.md`)
**Open bug reports:** none

## Iteration history

| Run | Result | Notes |
|---|---|---|
| Baseline (before any change) | 750 / 0 / 10 | Reference |
| Regression (production code only, no new tests) | 750 / 0 / 10 | No existing test needed changing |
| 1 | 1070 / 5 / 10 | `bugs-devmode-sharing-1.md`: B1 production (Coffee contrast), B4–B5 test bugs. B2–B3 were found and fixed in the visual pass before this run |
| 2 | 1075 / 0 / 10 | All closed |
| 3 | 1080 / 0 / 11 | Six tests added to close new-code coverage gaps (SU16b ×2, SHR38–SHR41). The extra pending was a pre-existing conditional skip in an older suite; it did not recur |
| 4, 5, 6 | 1081 / 0 / 10 each | Flakiness check: three consecutive clean runs after SHR40/41 were rewritten to cancel within one task |

No failure needed more than one fix iteration.

## New tests by area

| Area | Count |
|---|---|
| Unit — loading/sharing (config, codec, clipboard, loadPuzzle, loadProvider, puzzleLoader, state-unrated, notice, share) | 111 |
| Unit — developer mode (devMode, inspect, devPanel, pipeline-diagnostics) | 104 |
| Unit — extended suites (protocol, dialog, controls, numpad, keyboard, grid, arch) | 46 |
| Integration — `sharing.test.js` | 46 |
| Integration — `devmode.test.js` | 24 |

## Performance (three runs, headless Chromium)

| Measurement | Result | Budget |
|---|---|---|
| Load from string, cold (includes loader-worker startup), Hard | 164–189 ms | 1000 ms |
| Load from string, warm, Medium / Hard | 26–32 ms | 1000 ms |
| Load from string, warm, **Unrated** | 52–65 ms | 1000 ms |
| Share link → loaded, page boot included, generation worker busy with Diabolical | 398–444 ms | 1000 ms |
| Solver step inspector on an unrateable board (main thread) | 38–50 ms | 1000 ms |
| Existing actions (reset, pen entry, hint, check, difficulty change) | ≤ 6 ms | 1000 ms — unchanged |

## Exit criteria (project CLAUDE.md / brief §7)

| Criterion | Status |
|---|---|
| All tests pass, 3 consecutive runs | ✓ 1081/1081 ×3 |
| Branch coverage 100% | ✓ for all new modules and all added code in modified files, except one unconditional line inside a pre-existing excepted block (`coverage-devmode-sharing.md`); project-wide 93.50% with carried exceptions |
| Reviewer sign-off, no open blockers | ✓ |
| Functional correctness | ✓ generation is seed-identical to before (PD1); loaded puzzles are checked for a unique solution and re-rated |
| Performance < 1 s | ✓ table above; R12 met for rateable **and** unrateable puzzles |
| Accessibility | ✓ names, roles, focus, announcements asserted (SHR9, SHR31–34, DVI22, DP*); contrast ≥ 4.5:1 in all five themes |
| Visual design approved | Waived (brief §3); vspecs written; awaits UX review |
| Committed | Withheld (brief §3); everything is uncommitted in the working tree |
