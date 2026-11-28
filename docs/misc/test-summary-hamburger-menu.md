# Test Summary: Hamburger Menu and Control Consolidation (V4)

**Date:** 2026-11-27
**Branch:** `hamburger-menu` (working tree as staged, on top of `1ac9f03`)
**Role:** QE Test Runner
**Status: all exit criteria met. No bug reports opened.**

## 1. Full-suite runs

Each run was a separate `npm test`, run one after another with nothing else running on
the machine.

| Run | Passing | Failing | Pending | Exit |
|---|---|---|---|---|
| 1 | 2960 | 0 | 10 | 0 |
| 2 | 2960 | 0 | 10 | 0 |
| 3 | 2960 | 0 | 10 | 0 |

The counts are the same in all three runs and match the Test Writer's report. The 10
pending tests are the analyzer tests that were already pending, which wait on fixtures.
No run printed a `[page error]` or `[browser error]` line.

**Flakiness watch.** I read HMI12 and HMI14, the tests that race real generation, before
the runs. HMI12 retries the boot up to three times until the menu opens before the first
puzzle. If that never happens it fails, it doesn't skip. HMI14 no longer races
generation: it stubs `Worker.prototype.postMessage` to drop `GEN_REQUEST`, so the busy
card's Cancel always appears. Both passed in all three runs. As tspec §5.3 requires, the
document `focusin` and `click` listeners in `menu.js` read module-level state. Stale
listeners left by earlier unit mounts act on the latest rig and do nothing extra. None
of the three runs showed order dependence.

**Performance lines.** Every budgeted `[PERF]` line was within budget in every run. Two
observations, neither new to this feature:

- `Difficulty change to kiddie` took 598 ms in run 1, against 37 ms and 24 ms in runs 2
  and 3. That is inside the 1 s budget, but it uses 60% of it on a cold first run.
- `PERF-D4 longest comparison slice` is 161–187 ms, against a soft expectation of
  < 100 ms. `PERF-D2` is 142–166 ms, against a soft < 150 ms. Both are debug
  instrumentation, and their hard 1 s bounds hold.

## 2. Coverage

I reproduced the report independently from runs 1 and 3: the URL rewrite in
`CodeCoverageV2.md` §6, then
`npx c8 report --temp-directory=coverage/tmp --reporter=text --include='js/**' --exclude='js/tests/**'`.
Both runs gave the same numbers. The project headline is 98.38% statement, 97.26%
branch, 98.79% function and 98.38% line. Project-wide 100% is waived for V4.

**Criterion: 100% branch coverage of the feature's new and changed code. Met.**

| File | Scope | Branch arms covered |
|---|---|---|
| `js/ui/menu.js` | file-wide | 124 / 124 |
| `js/ui/requestFocus.js` | file-wide | 30 / 30 |
| `js/ui/stats.js` | file-wide | 26 / 26 |
| `js/ui/share.js` | file-wide | 12 / 12 |
| `js/main.js` | changed lines | 17 / 17 |
| `js/game/foreground.js` | changed lines | 3 / 3 |
| `js/ui/keyboard.js` | changed lines | 4 / 4 |
| `js/ui/themes.js` | changed lines | 4 / 4 |
| `js/ui/handedness.js` | changed lines | 3 / 3 |
| `js/ui/dialog.js` | changed lines | 2 / 2 |
| `js/ui/controls.js`, `js/ui/numpad.js` | changed lines | 0 / 0 (markup only) |

**Method for changed lines.** For each module, I took the lines that
`git diff -U0 main` marks as added. I counted every branch arm in c8's
`coverage-final.json` whose arm, or whose decision, starts on one of those lines. The
totals match `coverage-hamburger-menu.md` §3 exactly.

**Spot check.** Every remaining uncovered line falls outside the diff hunks:

- `main.js` 264–265, 313–314
- `dialog.js` 118
- `keyboard.js` 18, 37–38, 70
- `themes.js` 42
- `controls.js` 58, 81
- `numpad.js` 169–175, 276–278

The `numpad.js` hunks are at lines 4, 41, 43–62 and 149. So the Test Writer's claim
holds: those uncovered lines were there before this feature.

## 3. Manual checks deferred by tspec §5

These checks used trusted input, Playwright `page.mouse` and `page.keyboard` over CDP,
in headless Chromium. The app was served by a temporary static server on port 3012,
which was stopped afterwards. The viewport was 1280×1000. Each check read
`:focus-visible` and the computed `outline` on `.sudoku-grid`, plus
`gameState.getState().selected`. **Result: 23 / 23 pass.**

### (a) Grid focus ring, R14 / vspec §8.2

This was run in Coffee, Minimalist and Terminal.

| Check | Result in all three themes |
|---|---|
| A1: mouse click on an empty cell | Cell selected. Grid not `:focus-visible`, outline `none` |
| A2: mouse click on a number pad digit | Grid has no ring |
| A3: Reset by mouse (menu button, then Reset, then the dialog's Reset) | Grid has focus. Not `:focus-visible`, outline `none` |
| A4: New Puzzle by mouse | Grid has focus after the load. No ring |
| A5: Tab from New Puzzle to the grid | `:focus-visible`, `solid 2px` ring |
| A6: Enter on New Puzzle | Grid has focus after the load. Ring shown |
| A7: Reset by keyboard (Enter on the menu button, ArrowDown ×2 to `#mi-reset`, Enter, Enter on confirm) | Grid has focus. Ring shown |

The ring colours were as specified:

- Coffee: `rgb(201,169,122)`, which is `#c9a97a`, the vspec's Coffee override.
- Minimalist: `rgb(44,82,130)`, which is `--accent`.
- Terminal: `rgb(57,255,20)`, which is `--accent`.

### (b) Opening the menu from the keyboard keeps the cell selected

I mouse-clicked an empty cell, which selected it. I pressed Shift+Tab four times, which
brought focus to `#menu-button`, then pressed the key under test. I did this once for
Enter and once for Space.

The menu opened with focus on `#mi-stats`, and `selected` was unchanged. After Escape,
the menu was closed, focus was back on the button, and the cell was still selected. Both
keys pass. Space was the case most at risk, because a button fires its activation click
on keyup. No click was synthesized.

The check script is at
`/tmp/claude-1001/-home-brc-Documents-websites-sudoku2/d1825f40-f788-434c-af62-58cf28955933/scratchpad/manual-checks.mjs`.
It is in the session scratchpad, not the repo. Run it as `node manual-checks.mjs <baseUrl>`.

## 4. Bugs and open items

No bugs were found and no bug reports were written. No test code was changed.

There are two open items for the Orchestrator, neither of which blocks this feature:

1. The cold first `Difficulty change to kiddie` took 598 ms (§1). It is inside budget.
   Watch it if it trends upward.
2. `PERF-D2` and `PERF-D4` miss their soft expectations (§1). These belong to debug
   instrumentation and were there before this feature.

## 5. Exit criteria

| Criterion | Status |
|---|---|
| All tests pass (3 consecutive runs) | Met |
| Branch coverage per the PD criterion (100% new and changed code) | Met |
| No open bug reports | Met |
| Final summary written | This document |
