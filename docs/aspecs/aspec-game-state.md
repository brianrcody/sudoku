# Architectural Spec — Game State, Bootstrap, and Config
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 5–6), Reviewer, QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — for the master directory tree, event flow diagram, and cross-cutting conventions.
> **Also load:** `aspec-persistence.md` — for the persistence writer (§5), stats wiring code blocks (§3), and schemas referenced during bootstrap.
> **Also load:** `aspec-hints.md` — for the `SolverHintProvider` API consumed by the `HINT` action handler.

---

## Table of Contents

1. [Bootstrap — `js/main.js`](#1-bootstrap--jsmainjs)
2. [Config — `js/config.js`](#2-config--jsconfigjs)
3. [PRNG — `js/prng.js`](#3-prng--jsprgjs)
4. [Game State Shape — `js/game/state.js`](#4-game-state-shape--jsgamestatejs)
5. [Actions and Behavioral Obligations](#5-actions-and-behavioral-obligations)
6. [Conflicts — `js/game/conflicts.js`](#6-conflicts--jsgameconflictsjs)
7. [Correctness — `js/game/correctness.js`](#7-correctness--jsgamecorrectnessjs)

---

## 1. Bootstrap — `js/main.js`

### 1.1 Responsibilities

- Reads theme cookie and applies class before any render (per vspec §1.2).
- Instantiates `ClientGenProvider` and `SolverHintProvider`.
- Instantiates `GameState` (§4) and UI modules; wires events.
- Calls `primeNext(currentDifficulty)` on boot.
- Restores in-progress puzzle from `localStorage` per the resume behavior in `aspec-persistence.md` §4.
- Owns the top-level coordinator for user actions: New Puzzle, Reset, Difficulty change, Check, Hint, theme change.

### 1.2 Bootstrap Sequence

Strict order — no step may be reordered:

1. (Inline head script from `aspec-themes.md` §3 has already set the body theme class before this module runs.)
2. `initTheme()` — reconcile cookie with `classList` in case of drift between inline script and module load.
3. Import the `cookieStatsStore` singleton (named export from `providers/cookieStatsStore.js`), then `createStatsProvider(cookieStatsStore)` and `createStatistics(provider)`; `await stats.init()` — so the stats panel renders with real values on first paint.
4. Assemble `puzzleProvider` from named imports: `{ requestPuzzle, peekReady, primeNext }` (from `providers/puzzleProvider.js`). No constructor call.
5. Assemble `hintProvider` from named imports: `{ nextHint }` (from `providers/hintProvider.js`). No constructor call.
6. Construct `GameState` via `createGameState({ stats, hintProvider })`.
7. Restore or generate:
   - Read `sudoku.currentDifficulty.v1` from localStorage (default `'easy'`, validated against `DIFFICULTY_ORDER`).
   - Read `sudoku.state.v1` blob. If present (`blob.version === 1 && blob.puzzle`):
     1. Override `currentDifficulty` from `blob.difficulty` if set.
     2. Reconstruct the `puzzle` object with `Uint8Array` givens/solution.
     3. `dispatch({ type: 'PUZZLE_LOADED', puzzle })` — copies givens into `pen[]`.
     4. Restore saved `pen[]`: for each non-given cell with a non-zero saved pen value, `dispatch SELECT_CELL` then `dispatch PEN_ENTER` with `fromHint: true` (bypasses stats side-effects).
     5. Restore saved `pencil[]`: for each non-given cell with non-zero bits, `dispatch SELECT_CELL` then `dispatch PENCIL_TOGGLE` for each set bit.
     6. `dispatch({ type: 'DESELECT' })`.
     7. `dispatch({ type: 'RESTORE_SESSION', attemptRecorded, hintsRemaining })` — restores session flags that `PUZZLE_LOADED` reset to defaults.
   - If absent: `dispatch SET_GENERATING` true, call `puzzleProvider.requestPuzzle({ difficulty: currentDifficulty })`, dispatch `PUZZLE_LOADED` on resolution; on error log and `dispatch SET_GENERATING false`.
8. Mount UI modules in order: `srLive`, `themes` (select control), `controls`, `grid`, `numpad`, `stats`, `winBanner`, `dialog`, `keyboard`.
9. Subscribe the persistence writer (`aspec-persistence.md` §5) to state `'changed'` events.
10. Call `puzzleProvider.primeNext(currentDifficulty)`.

---

## 2. Config — `js/config.js`

Frozen constant tables. All are named exports; consumers import by name.

- `DIFFICULTY_ORDER = ['kiddie', 'easy', 'medium', 'hard', 'death-march']`
- `HINT_LIMITS = { kiddie: Infinity, easy: 3, medium: 1, hard: 0, 'death-march': 0 }`
- `CHECK_VISIBLE = { kiddie: false, easy: true, medium: true, hard: false, 'death-march': false }`
- `CORRECTNESS_MODE = { kiddie: 'realtime', easy: 'on-demand', medium: 'on-demand', hard: 'on-complete', 'death-march': 'on-complete-silent' }`
- `GIVEN_COUNT_TARGET` — soft targets per tier: Kiddie 45–50, Easy 36–42, Medium 30–34, Hard 26–30, Death March 22–26. These are guidance for the removal loop; the rater decides the final tier.
- `ATTEMPT_BUDGET = { kiddie: 20, easy: 30, medium: 60, hard: 150, 'death-march': 300 }` — max candidate puzzles attempted before returning the hardest-so-far (follow-up §2.2, flag 1).
- `WORKER_URL = './js/worker/generator.worker.js'`
- `CHECK_HIGHLIGHT_MS = 3000`
- `THEME_CLASSES = ['theme-minimalist', 'theme-coffee', 'theme-school', 'theme-terminal', 'theme-mountain']`
- `DEFAULT_THEME = 'theme-minimalist'`

---

## 3. PRNG — `js/prng.js`

- `mulberry32(seed: uint32) → () → float in [0,1)` — factory returning a seeded PRNG function.
- `randomSeed() → uint32` — generates a random seed using `crypto.getRandomValues`.
- `shuffle(arr: any[], rng: () => float) → arr` — Fisher-Yates in-place shuffle using the supplied rng. Mutates and returns the array.

---

## 4. Game State Shape — `js/game/state.js`

### 4.1 `createGameState` Factory

```js
createGameState({ stats, hintProvider }) → {
  dispatch(action) → void,
  getState() → GameState,          // returns the live object; consumers treat as read-only
  on(type, listener) → void,       // subscribe to 'changed' events per aspec-overview.md §5
  off(type, listener) → void,      // unsubscribe a previously registered listener
}
```

- `stats` — the `Statistics` instance. Used by `PEN_ENTER` / `HINT` / `ON_COMPLETION_EVALUATE` handlers per §5. Required.
- `hintProvider` — the `SolverHintProvider`. Used by the `HINT` action handler. Required.
- `puzzleProvider` is **not** a reducer dependency. `main.js` calls `puzzleProvider.requestPuzzle(...)` and dispatches `PUZZLE_LOADED`. The reducer never initiates puzzle generation.
- Config values (`HINT_LIMITS`, `CHECK_VISIBLE`, `CORRECTNESS_MODE`, `CHECK_HIGHLIGHT_MS`) are imported directly from `js/config.js`, not injected.

### 4.2 In-Memory State Shape

```js
GameState = {
  // Puzzle identity
  puzzle: {
    id: string,
    difficulty: Tier,
    givens: Uint8Array(81),           // 0 = empty
    solution: Uint8Array(81),
    solveTrace: Step[] | undefined,
  } | null,

  // Player entries
  pen: Uint8Array(81),                // 0 = empty
  pencil: Uint16Array(81),            // bitmask of candidate digits

  // UI flags (transient, not persisted)
  selected: int | null,
  activeMode: 'pen' | 'pencil',       // default pen; never persisted
  conflicts: Set<int>,
  incorrect: Set<int>,
  incorrectShownUntil: number | 0,    // timestamp; drives auto-clear timer

  // Hint / attempt bookkeeping
  hintsRemaining: int,
  attemptRecorded: bool,

  // Completion
  won: bool,
  winHandled: bool,

  // Pregen / async
  generating: bool,
  generatingMessage: string,

  // Completion feedback
  completionMessage: string,        // set on failed on-complete/on-complete-silent check; cleared by CLEAR_INCORRECT
}
```

Note on immutability: the reducer mutates `pen`, `pencil`, `conflicts`, and `incorrect` in place for performance. UI modules treat the state object as read-only (never mutate fields directly) and re-render via the `'changed'` event subscription.

---

## 5. Actions and Behavioral Obligations

All state transitions go through `GameState.dispatch(action)`.

### `PUZZLE_LOADED`
Sets `puzzle`. Initializes `pen` by copying `puzzle.givens` into all 81 cells (given values are stored in `pen[]` so the grid renders them — pen is not zeroed). Clears `pencil`. Resets all flags and counters: `hintsRemaining` set from `HINT_LIMITS[puzzle.difficulty]`, `attemptRecorded = false`, `won = false`, `winHandled = false`, `generating = false`, `generatingMessage = ''`, `completionMessage = ''`. Clears any pending `CLEAR_INCORRECT` timer.

### `SELECT_CELL` — `{ index: int }`
Sets `selected = index`. No effect if the cell is a given (`puzzle.givens[index] !== 0`).

### `DESELECT`
Sets `selected = null`.

### `ARROW_NAV` — `{ direction: 'up' | 'down' | 'left' | 'right' }`

Cell navigation behavioral obligations (from fspec §4.2):
- Navigation wraps at grid boundaries: pressing right from column 9 moves to column 1 of the same row; pressing down from row 9 moves to row 1 of the same column. Same wrap applies to left (col 1 → col 9) and up (row 1 → row 9).
- Given cells are skipped — arrow navigation lands on the nearest player cell in the direction of travel.
- If no cell is currently selected (`state.selected === null`), the first arrow key press selects the first player cell in reading order (top-left to bottom-right).

### `SET_MODE` — `{ mode: 'pen' | 'pencil' }`
Sets `activeMode`.

### `TOGGLE_MODE`
Toggles `activeMode` between `'pen'` and `'pencil'`.

### `PEN_ENTER` — `{ digit: int }`

Behavioral obligations (from fspec §6.2):
1. If no cell is selected, or selected cell is a given, no effect.
2. If the cell already contains the same pen digit, no effect.
3. If the cell contains pencil marks, they are cleared.
4. The entered digit becomes the committed pen digit (`pen[selected] = digit`).
5. Conflict detection evaluated immediately: recompute `conflicts` for affected row/col/box (see §6).
6. Correctness checking, if real-time (`CORRECTNESS_MODE[difficulty] === 'realtime'`, i.e. Kiddie), evaluated immediately (see §7).
7. Auto-clear of related pencil marks: remove `digit` as a pencil candidate from all cells in the same row, column, and box that have `digit` as a pencil mark.
8. Persistence written (debounced via the persistence writer subscriber).
9. Stats wiring (see `aspec-persistence.md` §3.1): only if `prevValue === 0` (cell was previously empty) and `fromHint !== true`:
   ```js
   if (!state.attemptRecorded) {
     state.attemptRecorded = true;
     stats.recordAttemptOnce(state.puzzle.difficulty); // fire-and-forget
   }
   ```
   Additionally, if `state.won` is already `true` at entry, `_applyPenEnter` returns immediately with no effect.
10. After pen entry, if all 81 cells are now filled, dispatch `ON_COMPLETION_EVALUATE`.

### `PENCIL_TOGGLE` — `{ digit: int }`

Behavioral obligations (from fspec §6.3):
1. If no cell is selected, or selected cell is a given, no effect.
2. If the cell contains a pen digit (`pen[selected] !== 0`), the entry is ignored.
3. Otherwise, toggle `digit` in `pencil[selected]` (add if absent, remove if present).
4. Persistence written.

### `ERASE`

Behavioral obligations (from fspec §6.4):
- If no cell selected, or selected cell is a given, no effect.
- If cell contains a pen digit: remove it (`pen[selected] = 0`), cell becomes empty, recompute `conflicts`. Auto-cleared pencil marks are not restored.
- If cell contains pencil marks (and no pen digit): clear all pencil marks (`pencil[selected] = 0`).
- If cell is empty: no effect.

### `HINT`

Behavioral obligations (from fspec §8.2 — see also `aspec-hints.md` for provider internals):
1. Guard: if `hintsRemaining === 0`, no effect. If no cell selected, no effect. If selected cell is a given, no effect. If selected cell contains a pen digit (`pen[selected] !== 0`), no effect.
2. Call `hintProvider.nextHint(state.puzzle, { pen: state.pen, conflicts: state.conflicts }, { targetCell: state.selected })`.
   - `conflicts` is required so the hint provider can filter out conflict-flagged pen entries when building the working board.
3. Apply the returned digit via the `PEN_ENTER` path with `fromHint = true` (bypasses the `attemptRecorded` PEN_ENTER guard).
4. All pencil marks in that cell are cleared (handled by PEN_ENTER path step 3).
5. Auto-clear of related pencil marks applied (PEN_ENTER path step 7).
6. `hintsRemaining` decrements by 1.
7. If `hintsRemaining` is now 0, the Hint button is permanently disabled for this puzzle (driven by UI reading `state.hintsRemaining`).
8. Conflict detection re-evaluated (PEN_ENTER path step 5).
9. Correctness evaluated if real-time (Kiddie) or if grid is now fully filled (Hard/Death March) (PEN_ENTER path step 6 / ON_COMPLETION_EVALUATE).
10. Persistence written.
11. Stats wiring (from `aspec-persistence.md` §3.2): immediately after hint digit written:
    ```js
    if (!state.attemptRecorded) {
      state.attemptRecorded = true;
      stats.recordAttemptOnce(state.puzzle.difficulty); // fire-and-forget
    }
    ```

### `CHECK`

Behavioral obligations (from fspec §7.2.2 — Easy/Medium only):
1. All filled player cells evaluated against `puzzle.solution`.
2. Cells with incorrect pen digits placed in `state.incorrect`.
3. Cells with correct pen digits removed from `state.incorrect`.
4. Empty cells not evaluated.
5. `incorrectShownUntil = Date.now() + CHECK_HIGHLIGHT_MS`.
6. A timer fires `CLEAR_INCORRECT` after `CHECK_HIGHLIGHT_MS` ms.

### `ON_COMPLETION_EVALUATE`

Triggered automatically when all 81 cells are filled (after every pen entry). Behavioral obligations by difficulty (from fspec §7.2.1–7.2.4):

**Kiddie (real-time):** Every pen entry already evaluates correctness individually. When the grid is full, evaluate the full solution. If correct: trigger win (set `won = true`, `winHandled = true`, call `stats.recordWin(...)`).

**Easy/Medium (on-demand):** When fully filled, evaluate. If correct: win. If incorrect: no automatic flag; player must press Check.

**Hard (on-complete):** When all 81 cells filled:
- Evaluate solution.
- If correct: win.
- If incorrect: flag all wrong cells in `state.incorrect`; message "Not quite — some cells are incorrect. Keep going!"; `incorrectShownUntil = Date.now() + CHECK_HIGHLIGHT_MS`; fire timer for `CLEAR_INCORRECT`. No win.

**Death March (on-complete-silent):** When all 81 cells filled:
- Evaluate solution.
- If correct: win.
- If incorrect: **no cell highlighting**; message only: "Not quite. Keep going!". `state.incorrect` remains empty. No win.

**Win stats wiring** (from `aspec-persistence.md` §3.3): when `correct === true` and `!state.winHandled`:
```js
state.won = true;
state.winHandled = true;
stats.recordWin(state.puzzle.difficulty); // fire-and-forget
```

### `CLEAR_INCORRECT`
Clears `state.incorrect` and resets `incorrectShownUntil` to `0`. Fired by timer.

### `NEW_PUZZLE` — `{ difficulty: Tier, puzzle: Puzzle }`

Behavioral obligations (from fspec §9.1):
- The reducer receives this action only after any necessary confirmation dialog has been resolved by `main.js`. The reducer itself does not open dialogs.
- Confirmation is required when a puzzle is in progress (at least one pen digit or hint entered and puzzle not yet won). No confirmation if no puzzle is loaded or puzzle is complete.
- Dialog text: "Start a new puzzle? Your current progress will be lost." [Cancel] [New Puzzle]
- On confirm: sets puzzle, resets all state fields, sets `attemptRecorded = false`, clears `sudoku.state.v1` in `localStorage`.

### `RESET_PUZZLE`

Behavioral obligations (from fspec §9.2):
- Confirmation dialog always required: "Reset puzzle? Your entries will be cleared." [Cancel] [Reset]
- On confirm:
  1. `pen` restored to givens values: each cell is set to `puzzle.givens[i]` (player entries erased, givens preserved).
  2. All pencil marks removed (`pencil` zeroed).
  3. `hintsRemaining` restored to `HINT_LIMITS[puzzle.difficulty]`.
  4. `incorrect` and `conflicts` cleared.
  5. `activeMode` reset to `'pen'`.
  6. `attemptRecorded` is **preserved** (does not re-increment on next entry, per fspec §9.2 step 6).
  7. Persistence updated.

### `CHANGE_DIFFICULTY` — `{ difficulty: Tier }`

Behavioral obligations (from fspec §3.2):
- The reducer receives this action only after any necessary confirmation dialog has been resolved by `main.js`.
- Updates `state.puzzle.difficulty` (if a puzzle is loaded) to the new tier.
- Sets `hintsRemaining` to `HINT_LIMITS[difficulty]`.
- Does **not** null out the puzzle, clear `pen`, `pencil`, or any other flags. Difficulty is applied in-place to the current puzzle state.
- Emits changed keys: `puzzle`, `hintsRemaining`.

### `SET_GENERATING` — `{ flag: bool, message?: string }`
Sets `generating` and optionally `generatingMessage`. Used while waiting for the Worker to deliver a puzzle.

---

## 6. Conflicts — `js/game/conflicts.js`

```js
computeConflicts(board: Uint8Array(81)) → Set<int>
```

Behavioral obligations (from fspec §7.1):
- Returns the set of cell indices of all cells participating in any conflict.
- A conflict exists when two cells in the same row, column, or box both contain the same committed pen digit.
- All participating cells flagged simultaneously: if cells A and B conflict, both are in the returned set.
- Recomputed on every pen-entry or erase event.
- Structural — does not consult `puzzle.solution`. A digit that is the correct answer can still conflict if duplicated.

---

## 7. Correctness — `js/game/correctness.js`

Three functions for the different correctness modes:

```js
checkRealtime(state: GameState, cellIndex: int) → void
checkAll(state: GameState) → Set<int>
checkOnComplete(state: GameState) → { correct: bool, wrong: Set<int> }
```

- `checkRealtime` — for Kiddie. Evaluates cell at `cellIndex` against `state.puzzle.solution`. Updates `state.incorrect` immediately (adds or removes that cell).
- `checkAll` — for Easy/Medium Check button. Evaluates all filled player cells against solution. Returns set of wrong cell indices.
- `checkOnComplete` — for Hard/Death March. Evaluates the fully-filled board. Returns `{ correct, wrong }` where `wrong` is the set of incorrect cell indices (used by Hard; ignored by Death March which never highlights cells).
