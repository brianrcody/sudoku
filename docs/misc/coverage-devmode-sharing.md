# Code Coverage Report — Developer Mode + Puzzle Sharing (V4)

**Date:** 2026-11-13
**Test run:** 1081 passing, 0 failing, 10 pending (three consecutive identical runs)
**Coverage tool:** c8 via Playwright `page.coverage` (reproduce per CodeCoverageV2.md §6)
**Target (per CLAUDE.md and brief §4):** 100% branch, developer-mode code included

## Headline

| Metric | This work | Left-hand baseline | Delta |
|---|---|---|---|
| Statement | 96.89% | 95.92% | +0.97 |
| Branch | 93.50% | 91.94% | +1.56 |
| Function | 97.08% | 95.91% | +1.17 |

## New files — all 100% branch

| File | Stmts | Branch | Funcs |
|---|---|---|---|
| `js/dev/devMode.js` | 100 | **100** | 100 |
| `js/dev/inspect.js` | 100 | **100** | 100 |
| `js/dev/devPanel.js` | 100 | **100** | 100 |
| `js/game/puzzleLoader.js` | 100 | **100** | 100 |
| `js/generator/loadPuzzle.js` | 100 | **100** | 100 |
| `js/providers/loadProvider.js` | 100 | **100** | 100 |
| `js/ui/notice.js` | 100 | **100** | 100 |
| `js/ui/share.js` | 100 | **100** | 100 |
| `js/util/puzzleString.js` | 100 | **100** | 100 |
| `js/util/clipboard.js` | 100 | **100** | 100 |

## Modified files — every added line and branch covered, with one exception

Method: uncovered lines and zero-hit branches from the lcov output were intersected with
the lines added by `git diff -U0`. The intersection is empty for every modified file
except `main.js`.

| File | Branch now | Was | New code uncovered | Remaining gaps |
|---|---|---|---|---|
| `js/config.js` | 100% | 100% | none | — |
| `js/worker/protocol.js` | 100% | 100% | none | — |
| `js/generator/pipeline.js` | 93.10% | — | none | 155, 162: pre-existing `?? tier` fallbacks |
| `js/game/state.js` | 88.12% | 85.65% | none | pre-existing reducer guards (carried from V2) |
| `js/ui/dialog.js` | 92.85% | — | none | 109: pre-existing pre-mount guard in `close` |
| `js/ui/controls.js` | 91.66% | — | none | 51, 72–73: pre-existing defaults |
| `js/ui/grid.js` | 90.72% | — | none | pre-existing |
| `js/ui/keyboard.js` | 91.66% | — | none | pre-existing |
| `js/ui/numpad.js` | 71.83% | — | none | pre-existing (carried from V2) |
| `js/ui/coach.js` | 88.04% | — | none | pre-existing |
| `js/providers/clientGenProvider.js` | 90.90% | 90.47% | none | pre-existing worker-error and storage-catch paths |
| `js/main.js` | **89.88%** | 73.33% | **1 line** (283) | 273–288 honest-fallback dialog, 293–297 generation-error catch |

### The one exception — `main.js` line 283

`preferredTier = puzzle.difficulty;` sits inside the honest-fallback dialog's `onConfirm`
(lines 273–288), a block that has been a documented coverage exception since V3
(`CodeCoverageV3.md` §2): reaching it requires a Diabolical/Nightmare budget exhaustion
through the UI, which cannot be forced because seeds are not controllable from outside
the app. The added line is a single unconditional assignment with no branch. Closing it
would mean making the generation seed injectable through `main.js` — a non-trivial
production change that the Uber Developer process says to escalate rather than make.
It is recorded here and in the final report instead.

`main.js` as a whole rose 16.5 points because the new integration suites exercise the
restore defaults, the cancel-during-generation path, and the generation-tier logic that
were previously uncovered.

## Worker code

`generator.worker.js` runs outside the page coverage collector (existing policy,
`test-runner/run.js`). Its new branch is a three-line dispatch to `loadFromGivens`, which
is covered at 100% by direct import (LP1–LP10) and exercised through the real worker by
LV7, SHR1–SHR41, and DVI10–DVI16.

## Carried exceptions (unchanged by this work)

`analyzer.js`, `coachOverlay.js`, `numpad.js`, `srLive.js`, `stats.js`, `themes.js`,
`winBanner.js`, `fillGrid.js`, `rater.js`, `storage.js`, `cookieStatsStore.js`,
`hintProvider.js`, `uniqueness.js`, `coloring.js`, `xyWing.js`, `events.js` — as listed in
`CodeCoverageV3.md` §2 and `coverage-left-hand.md`. Project-wide branch coverage is
therefore 93.50%, not 100%; this work added no new gap beyond the line above.
