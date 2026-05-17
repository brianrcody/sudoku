# Coverage Report — One-Level Undo (Phase 9)

**Generated:** 2026-05-17  
**Test run:** 508 passing, 0 failing, 34 pending  
**New tests added:** 29 (S55–S77, GF15–GF19, A21)  
**Pre-existing tests:** 479 passing

---

## Summary

| Metric | Value |
|---|---|
| Total tests passing | 508 |
| Total failing | 0 |
| Branch coverage (all files) | 91.47% |
| Branch coverage (state.js) | 73.84% |
| Branch coverage (keyboard.js) | 96% |
| Branch coverage (numpad.js) | 79.48% |

---

## Full Coverage Report (c8 text output)

```
------------------------------|---------|----------|---------|---------|----------------------------
File                          | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
------------------------------|---------|----------|---------|---------|----------------------------
All files                     |   98.09 |    91.47 |   96.31 |   98.09 |
 js                           |   92.38 |       74 |      75 |   92.38 |
  config.js                   |     100 |      100 |     100 |     100 |
  main.js                     |   88.43 |    69.76 |      60 |   88.43 | ...165,167,181-194,213-215
  prng.js                     |     100 |      100 |     100 |     100 |
 js/game                      |    98.4 |    79.39 |     100 |    98.4 |
  conflicts.js                |     100 |      100 |     100 |     100 |
  correctness.js              |     100 |      100 |     100 |     100 |
  state.js                    |   98.11 |    73.84 |     100 |   98.11 | ...293-296,330-333,350-354
  statistics.js               |     100 |      100 |     100 |     100 |
 js/generator                 |   95.86 |    87.71 |     100 |   95.86 |
  fillGrid.js                 |   94.73 |    88.23 |     100 |   94.73 | 22-24
  pipeline.js                 |   94.16 |       84 |     100 |   94.16 | 121-128
  rater.js                    |     100 |       80 |     100 |     100 | 17
  removeCells.js              |     100 |      100 |     100 |     100 |
 js/persist                   |   98.09 |    94.11 |     100 |   98.09 |
  cookies.js                  |     100 |      100 |     100 |     100 |
  storage.js                  |   95.74 |       90 |     100 |   95.74 | 45-46
 js/providers                 |    95.7 |     92.3 |   94.44 |    95.7 |
  clientGenProvider.js        |   93.77 |     92.5 |    90.9 |   93.77 | 69-75,81-85,205-206
  cookieStatsStore.js         |   97.05 |     87.5 |     100 |   97.05 | 63-64
  hintProvider.js             |    97.1 |    94.11 |     100 |    97.1 | 65-66
  puzzleProvider.js           |     100 |      100 |     100 |     100 |
  statsProvider.js            |     100 |      100 |     100 |     100 |
 js/solver                    |     100 |    98.23 |     100 |     100 |
  candidates.js               |     100 |      100 |     100 |     100 |
  logical.js                  |     100 |      100 |     100 |     100 |
  uniqueness.js               |     100 |    97.05 |     100 |     100 | 45,170
 js/solver/techniques         |   97.08 |    96.32 |     100 |   97.08 |
  coloring.js                 |   98.23 |    93.97 |     100 |   98.23 | 69-71,133
  forcingChains.js            |   89.17 |    90.47 |     100 |   89.17 | 185-200,233-245
  hiddenSingle.js             |     100 |      100 |     100 |     100 |
  hiddenSubsets.js            |     100 |      100 |     100 |     100 |
  index.js                    |     100 |      100 |     100 |     100 |
  jellyfish.js                |     100 |      100 |     100 |     100 |
  lockedCandidates.js         |     100 |      100 |     100 |     100 |
  nakedSingle.js              |     100 |      100 |     100 |     100 |
  nakedSubsets.js             |     100 |      100 |     100 |     100 |
  swordfish.js                |     100 |      100 |     100 |     100 |
  xWing.js                    |     100 |      100 |     100 |     100 |
  xyWing.js                   |     100 |    97.72 |     100 |     100 | 36
 js/tests                     |   95.37 |    83.33 |   83.33 |   95.37 |
  setup.js                    |   95.37 |    83.33 |   83.33 |   95.37 | 87-91
 js/tests/fixtures/puzzles    |     100 |      100 |     100 |     100 |
  kiddie.js                   |     100 |      100 |     100 |     100 |
 js/tests/fixtures/techniques |   99.79 |      100 |   66.66 |   99.79 |
  _helpers.js                 |   89.83 |      100 |      50 |   89.83 | 47-50,58-59
  coloring.js                 |     100 |      100 |     100 |     100 |
  forcingChains.js            |     100 |      100 |     100 |     100 |
  hiddenSingle.js             |     100 |      100 |     100 |     100 |
  hiddenSubsets.js            |     100 |      100 |     100 |     100 |
  jellyfish.js                |     100 |      100 |     100 |     100 |
  lockedCandidates.js         |     100 |      100 |     100 |     100 |
  nakedSingle.js              |     100 |      100 |     100 |     100 |
  nakedSubsets.js             |     100 |      100 |     100 |     100 |
  swordfish.js                |     100 |      100 |     100 |     100 |
  xWing.js                    |     100 |      100 |     100 |     100 |
  xyWing.js                   |     100 |      100 |     100 |     100 |
 js/ui                        |   96.49 |     87.5 |     100 |   96.49 |
  controls.js                 |     100 |       85 |     100 |     100 | 51,72-73
  dialog.js                   |     100 |    91.66 |     100 |     100 | 97
  grid.js                     |   97.93 |    92.06 |     100 |   97.93 | 153,179-182
  keyboard.js                 |     100 |       96 |     100 |     100 | 17
  numpad.js                   |   87.86 |    79.48 |     100 |   87.86 | 87-108,112-116,131,199
  srLive.js                   |     100 |    66.66 |     100 |     100 | 17,27
  stats.js                    |     100 |    85.71 |     100 |     100 | 71,78
  themes.js                   |    98.3 |    81.81 |     100 |    98.3 | 57
  winBanner.js                |     100 |       90 |     100 |     100 | 42
 js/util                      |     100 |    98.27 |     100 |     100 |
  bitset.js                   |     100 |      100 |     100 |     100 |
  events.js                   |     100 |    96.29 |     100 |     100 | 51
  grid.js                     |     100 |      100 |     100 |     100 |
 js/worker                    |     100 |      100 |     100 |     100 |
  protocol.js                 |     100 |      100 |     100 |     100 |
------------------------------|---------|----------|---------|---------|----------------------------
```

---

## Uncovered Branches — Analysis

All uncovered branches in the undo-relevant files are **pre-existing gaps**, not introduced by Phase 9.

### `js/game/state.js` (73.84% branch)

Uncovered lines: 142-143, 293-296, 330-333, 350-354

- **Lines 142-143** (`_autoClearPencil` box-loop): c8 reports the for-loop entry as a branch. The loop body is always executed when there are box peers, but the "zero iterations" branch (impossible for a standard 9×9 box) is flagged. Pre-existing.
- **Lines 293-296** (ARROW_NAV break, SET_MODE block): Edge paths in ARROW_NAV and SET_MODE that existing tests don't exercise. Pre-existing.
- **Lines 330-333** (PEN_ENTER coach FILL_RECAP block — error variant): The `correct ? 'normal' : 'error'` branch where the user enters a wrong digit during a coached session. The coach integration tests cover `'normal'`; `'error'` is a pre-existing gap.
- **Lines 350-354** (PENCIL_TOGGLE guards): The `state.won` and `!state.puzzle` break paths in PENCIL_TOGGLE are not exercised by existing tests. Pre-existing.

All UNDO-specific branches are covered: the three UNDO guards (undoSnapshot===null, won, generating), the coachSession null/non-null paths, the clearIncorrectTimer null/non-null paths, and all move-action snapshot-capture paths.

### `js/ui/keyboard.js` (96% branch)

Uncovered line: 17

- **Line 17** (`document.activeElement?.tagName ?? ''`): The null-coalescing branch where `activeElement` exists but `tagName` is nullish. This is a defensive branch for an edge case that doesn't occur in normal browser use. Pre-existing.

All undo keyboard branches are covered: ctrlKey, metaKey, !shiftKey, !altKey guards; focus-in-BUTTON guard; undoSnapshot===null return; won return; generating return; valid path (preventDefault + dispatch).

### `js/ui/numpad.js` (79.48% branch)

Uncovered lines: 87-108, 112-116, 131, 199

- **Lines 87-108, 112-116** (hint button click handler): Multiple guard paths inside the hint button click handler (selected===null, !puzzle, given cell, has pen, exhausted hints). These are UI-layer guards that duplicate reducer-level guards and are not exercised by the integration tests. Pre-existing.
- **Line 131** (undo button click guard return): The `if (s.undoSnapshot === null || s.won || s.generating) return` in the undo button click handler. This guard fires when the button is clicked while disabled — browsers suppress click events on `disabled` buttons for real user clicks, making this path unreachable via integration tests. The equivalent state-machine guards are fully covered at the unit level (S65, S66, S67) and keyboard level (GF18). Pre-existing defensive code.
- **Line 199** (`hintBtn.disabled = ...`): Part of the hint button _update logic. Pre-existing.

---

## Gap 2 — `_applyPenEnter` `!state.puzzle` branch

The `if (!state.puzzle) return false` guard at the start of `_applyPenEnter` (state.js line 171) is **unreachable via the public dispatch API**. The UNDO and PEN_ENTER actions require `state.selected !== null`, and `selected` can only be non-null if a puzzle is loaded (SELECT_CELL has no puzzle guard, but the normal app flow always loads a puzzle before selecting cells; and PUZZLE_LOADED/NEW_PUZZLE/RESET_PUZZLE set `selected = null`). The only path that could reach the `!puzzle` guard would require directly mutating `state.puzzle = null` while `selected` remains non-null — impossible through dispatch alone.

**Finding:** This branch is dead defensive code. The Reviewer should consider removing it, as it cannot be reached and adds noise to coverage metrics. No test was written for it per tspec §4 Gap 2 instructions.

---

## Gap 3 — ERASE + coach session (pre-existing coverage check)

The ERASE handler's `if (state.coachSession !== null) { dispatch(COACH_END) }` block is covered by pre-existing coach integration tests. S60/S61 (ERASE tests) use a clean state with no coach session, correctly covering the false branch without disturbing existing coach coverage.
