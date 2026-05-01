# Architectural Spec — Hint Provider
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 5), Reviewer, QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — for the master directory tree and cross-cutting conventions.
> **Also load:** `aspec-solver.md` (§6) — `hintProvider.js` drives `solveLogically` directly.
> **Also load:** `aspec-game-state.md` (§5, HINT action) — for how the reducer invokes and applies the hint.

---

## Table of Contents

1. [Hint Provider — `js/providers/hintProvider.js`](#1-hint-provider--jsprovidersubhintproviderjs)
2. [Hint Button State Rules](#2-hint-button-state-rules)
3. [Hint Activation Flow](#3-hint-activation-flow)
4. [Hint Count Display](#4-hint-count-display)
5. [Coach Mode Hook](#5-coach-mode-hook)

---

## 1. Hint Provider — `js/providers/hintProvider.js`

`hintProvider.js` exports a named function:

```js
nextHint(
  puzzle: Puzzle,
  playerState: { pen: Uint8Array(81), conflicts: Set<int> },
  { targetCell?: int } = {}
) → { cellIndex: int, digit: int, technique: string } | null
```

**Working board construction rule:** Start with `puzzle.givens`; overlay `playerState.pen` values that are non-zero and not conflict-flagged (i.e., not in `playerState.conflicts`). Pencil marks are ignored — candidates are recomputed fresh from the working board.

**With `targetCell`:** Return `{ cellIndex: targetCell, digit: puzzle.solution[targetCell], technique }` where `technique` is the name of the technique the solver would use to place that cell next given the player's current state. To derive `technique`: run `solveLogically(workingBoard)` and scan the resulting trace for the first `Step` where `cellIndex === targetCell` and `digit !== null` (a placement step). If no such step exists (the target cell appears only in elimination steps, or the solver did not reach it), return `technique: 'solution-lookup'`.

**Without `targetCell`:** Return the first placement step from the solver trace — the first `Step` in `trace` with `digit !== null`. This form is the forward-looking interface for future coach/teaching mode. If the solver trace yields no placement step, falls through to scan the working board for the first unfilled cell (`board[i] === 0`) and returns `{ cellIndex: i, digit: puzzle.solution[i], technique: 'solution-lookup' }`. Returns `null` only if the board is already fully filled (no unfilled cells remain).

The game's hint flow always passes `targetCell = state.selected` (see `aspec-game-state.md` §5, HINT action).

---

## 2. Hint Button State Rules

The UI derives Hint button enabled/disabled state from `GameState` on every render. Behavioral obligations (from fspec §8.1):

| Condition | Button State |
|---|---|
| No hints remaining (`state.hintsRemaining === 0`) | Disabled permanently for this puzzle |
| Puzzle won (`state.won === true`) | Disabled |
| No cell selected (`state.selected === null`) | Enabled (but tap has no effect — reducer guards) |
| Selected cell is a given (`puzzle.givens[state.selected] !== 0`) | Enabled (but tap has no effect — reducer guards) |
| Selected cell contains a pen digit (`state.pen[state.selected] !== 0`) | Disabled |
| Selected cell contains only pencil marks or is empty | Enabled |

The reducer enforces all guards independently (see `aspec-game-state.md` §5, HINT action). The UI disabling is for usability; the reducer is authoritative.

---

## 3. Hint Activation Flow

When the HINT action fires and all guards pass (from fspec §8.2):

1. The correct digit for the selected cell is filled in as a pen digit (`pen[selected] = digit`).
2. All pencil marks in that cell are cleared (`pencil[selected] = 0`).
3. Stats wiring: if `!state.attemptRecorded`, set `attemptRecorded = true` and call `stats.recordAttemptOnce(difficulty)` (fire-and-forget). See `aspec-persistence.md` §3.2.
4. Remaining hint count decrements by 1 (`hintsRemaining -= 1`).
5. If `hintsRemaining` is now 0, the Hint button is permanently disabled for this puzzle (driven by UI reading `state.hintsRemaining === 0`).
6. Auto-clear of related pencil marks is applied — digit D is removed as a pencil candidate from all cells in the same row, column, and box that have D as a pencil mark. This is identical to the auto-clear applied on player pen entry.
7. Conflict detection re-evaluated — `computeConflicts(state.pen)` called, result stored in `state.conflicts`.
8. Correctness evaluated:
   - If real-time mode (Kiddie): evaluate the hint-filled cell immediately.
   - If the grid is now fully filled (all 81 cells non-zero): trigger `ON_COMPLETION_EVALUATE`.
9. Persistence written.

---

## 4. Hint Count Display

The remaining hint count is displayed on or immediately adjacent to the Hint button at all times (from fspec §8.3):

| Difficulty | Display values |
|---|---|
| Kiddie | "∞" always |
| Easy | "3", "2", "1", or "0" (button disables immediately after last hint consumed) |
| Medium | "1" or "0" (same note) |
| Hard / Death March | "0" always (button always disabled) |

When the button is disabled due to exhaustion, the count display may be omitted or shown as "0" — Visual Designer's call.

---

## 5. Coach Mode Hook

The `targetCell`-absent form of `nextHint` returns the first placement step from the solver trace — the forward-looking interface for future `CoachProvider` or `ExplanationProvider` implementations. No changes to game logic or UI are required to introduce these future providers. The seam is already present in `hintProvider.js`.
