# Code Coverage Report: Hamburger Menu and Control Consolidation (V4)

**Date:** 2026-11-27
**Test run:** 2960 passing, 0 failing, 10 pending
**Coverage tool:** c8 via Playwright `page.coverage`. Reproduce per `CodeCoverageV2.md` §6,
then `npx c8 report --temp-directory=coverage/tmp --reporter=text --include='js/**' --exclude='js/tests/**'`.
**Target (PD, 2026-11-27):** 100% branch on all new and changed code in this feature.
Project-wide 100% is not the target (V4 waiver).
**Status: met.**

## 1. Project headline

| Statement | Branch | Function | Line |
|---|---|---|---|
| 98.38% | 97.25% | 98.79% | 98.38% |

## 2. File-wide targets

| File | Statement | Branch | Function | Notes |
|---|---|---|---|---|
| `js/ui/menu.js` (new) | 100% | **100%** | 100% | 124 branch arms. MN1–MN116, plus HMI3 for the real `matchMedia` default |
| `js/ui/requestFocus.js` (new) | 100% | **100%** | 100% | 30 arms. RQF1–RQF32. RQF31 is kept: the code uses `target?.focus()` |
| `js/ui/stats.js` (reworked) | 100% | **100%** | 100% | US1–US21. US22 dropped: the rework removed the `if (!tbody)` guard |
| `js/ui/share.js` (reworked) | 100% | **100%** | 100% | SH1–SH21 |

## 3. Changed modules: changed-line branch check

The arms counted are those whose decision or arm starts on a line that `git diff -U0 main`
marks as added. The data comes from c8's `coverage-final.json`.

| File | File-wide branch | Changed-line arms covered | Remaining uncovered lines (all pre-existing, outside the diff) |
|---|---|---|---|
| `js/main.js` | 95.60% | **17 / 17** | 264–265 (`_isInProgress` no-puzzle and won guards), 313–314 (`_saveState` guards) |
| `js/game/foreground.js` | 100% | **3 / 3** | — |
| `js/ui/dialog.js` | 93.33% | **2 / 2** | 118 (`close()` before mount) |
| `js/ui/keyboard.js` | 92.42% | **4 / 4** | 18, 37–38, 70 (pre-existing `?.`/`??` arms) |
| `js/ui/themes.js` | 91.66% | **4 / 4** | 42 (`DISPLAY_NAMES[...] ?? themeClass`) |
| `js/ui/handedness.js` | 100% | **3 / 3** | — |
| `js/ui/controls.js` | 94.73% | 0 / 0 (markup only) | 58, 81 (pre-existing) |
| `js/ui/numpad.js` | 77.92% | 0 / 0 (markup only) | 169–175, 276–278 (pre-existing) |

For `main.js`, every new closure runs: the menu hooks, the `beforeOpen` closure, the share
`returnFocus` closure, `_startFrom` and its `onOutcome` closure, the `createRequestFocus`
getters, and `_confirmReset`'s `gridEl.focus()`. HMI7–HMI18, HMS1 and SHR32 exercise them.

`keyboard.js` gained a `?.focus()` arm (a selection with no rendered cell) that the tspec
did not list. UK21 covers it.

## 4. Test results

| Run | Passing | Failing | Pending |
|---|---|---|---|
| Baseline (before this work) | 2756 | 0 | 10 |
| After this work | 2960 | 0 | 10 |

The silent-skip hazard (aspec §13) is checked: A17, GF8 and SYS4 report as passed, not
pending.

## 5. Unreachable branches

None found. Every arm in the feature's scope is covered.

## 6. Out of c8 scope

`index.html`, `css/menu.css`, `base.css`, `grid.css`, `controls.css` and `stats.css` are
covered by behavior: HMI1–HMI4, HMI19–HMI24, HMS2, and the repaired SYS5/SYS8–SYS10.
