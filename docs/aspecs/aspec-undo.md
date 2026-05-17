# Architectural Spec — One-Level Undo
**ID:** aspec-undo
**Status:** Final
**Date:** 2026-05-17
**Author:** Architect
**Loaded by:** Implementor (Phase 9 — Undo), Reviewer, QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — master directory tree, event-flow diagram, cross-cutting conventions.
> **Also load:** `aspec-game-state.md` (§4.2 GameState shape, §5 actions) — the reducer this spec extends.
> **Also load:** `aspec-coach-ui.md` (§2 CoachSession, §3.2 COACH_END, §5 pencil revert, §10 numpad restructuring) — interaction with coach session lifecycle.
> **Also load:** `aspec-ui.md` (§5 focus pattern, §10 srLive, §11 keyboard) — numpad/keyboard conventions.
> **Also load:** `aspec-persistence.md` (§5 persistence writer) — confirms restored state is persisted, snapshot is not.

---

## Table of Contents

1. [Scope and Feasibility](#1-scope-and-feasibility)
2. [Snapshot Storage](#2-snapshot-storage)
3. [Snapshot Lifecycle](#3-snapshot-lifecycle)
4. [The `UNDO` Action](#4-the-undo-action)
5. [Button State Rules](#5-button-state-rules)
6. [Keyboard Shortcut](#6-keyboard-shortcut)
7. [HTML / CSS Changes](#7-html--css-changes)
8. [SR Announcement](#8-sr-announcement)
9. [Persistence Interaction](#9-persistence-interaction)
10. [Emit Keys](#10-emit-keys)
11. [Test Implications](#11-test-implications)
12. [Implementation Sequence](#12-implementation-sequence)

---

## 1. Scope and Feasibility

**Verdict: feasible with no architectural risk.** The feature fits the existing reducer/emitter pattern with one new state field (`undoSnapshot`), one new action (`UNDO`), small snapshot-capture hooks in three existing handlers, one numpad row, and one keyboard shortcut. No new modules, no build-step impact, no server-side code, well under the 1 s performance budget (the snapshot is two typed-array copies, 243 bytes total; restore is two `.set()` calls plus an 81-cell `computeConflicts`).

**One-level only, no redo (requirement 7):** confirmed. The snapshot is captured *before* a mutating action applies and is cleared by the `UNDO` action itself, so a second consecutive undo is impossible. There is intentionally no redo stack.

**Session-only (requirement 8):** `undoSnapshot` is never serialized into `sudoku.state.v1`; on resume it initializes to `null`, so the button starts disabled after a refresh. This requires zero change to `aspec-persistence.md` §5/§10.2 — the persistence writer already serializes only an explicit field list (`pen`, `pencil`, `hintsRemaining`, `attemptRecorded`), so `undoSnapshot` is excluded by omission. No change to the writer is needed.

**Winning-move undo — resolved:** Undo is blocked while `won === true`. Rationale in §4.6. **Confirmed by user 2026-05-17.** No further negotiation required.

---

## 2. Snapshot Storage

A new field is added to `GameState`:

```js
/**
 * @typedef {Object} UndoSnapshot
 * @property {Uint8Array}  pen              - Copy of pen[] before the last move.
 * @property {Uint16Array} pencil           - Copy of pencil[] before the last move.
 * @property {number}      hintsRemaining   - hintsRemaining before the last move.
 * @property {boolean}     attemptRecorded  - attemptRecorded before the last move.
 */

// Added to GameState:
// undoSnapshot: UndoSnapshot | null
```

Added to the initial `state` object in `createGameState` as `undoSnapshot: null`.

**What is captured and why:**

| Field | Snapshotted? | Rationale |
|---|---|---|
| `pen` | **Yes** | Core requirement. |
| `pencil` | **Yes** | Core requirement — critical case (requirement 3): a `PEN_ENTER` auto-clears peer pencil marks via `_autoClearPencil`; restoring the pre-move `pencil` array restores all of them. |
| `hintsRemaining` | **Yes (no-op in practice — see §4.7)** | Captured for structural symmetry and self-documenting invariant. In practice the restore is always a no-op because `HINT` never captures a snapshot. |
| `attemptRecorded` | **Yes** | A first `PEN_ENTER` flips `attemptRecorded` false→true. Restoring the flag keeps `GameState` internally consistent. The stats cookie is intentionally *not* decremented (see §4.7). |
| `conflicts` | **No** (recomputed) | Pure function of `pen`. Recomputed via `computeConflicts(state.pen)` after restore — guaranteed correct, no snapshot needed. |
| `incorrect` / `incorrectShownUntil` | **No** (cleared) | Transient highlight state. Cleared on undo (§4.4) rather than restored — a stale flag pointing at a now-reverted cell would be misleading. |
| `selected`, `activeMode` | **No** (preserved live) | Not part of a "move". Preserved as-is (§4.5). |
| `won`, `coachSession` | **No** | Undo is blocked while won (§4.6); coach session is force-ended on undo (§4.3). |

Snapshot arrays are **fresh copies** (`new Uint8Array(state.pen)`, `new Uint16Array(state.pencil)`), never references into the live arrays.

---

## 3. Snapshot Lifecycle

### 3.1 Actions that SET the snapshot

Exactly three actions capture a snapshot: `PEN_ENTER`, `PENCIL_TOGGLE`, `ERASE`. The snapshot is taken **before any mutation**, and **only when the action is a real move (not a no-op)**.

The capture is performed by a shared helper added to `createGameState`:

```js
function _captureUndoSnapshot() {
  state.undoSnapshot = {
    pen: new Uint8Array(state.pen),
    pencil: new Uint16Array(state.pencil),
    hintsRemaining: state.hintsRemaining,
    attemptRecorded: state.attemptRecorded,
  };
}
```

**Placement per handler — must be after the no-op guards, before the mutation:**

- **`PEN_ENTER`** — `_applyPenEnter` already early-returns on no-ops (`!puzzle`, given cell, `state.won`, `prevValue === digit`). The snapshot must NOT be captured for any of these. Modify `_applyPenEnter` to return a boolean (`true` if a mutation occurred, falsy otherwise). The `PEN_ENTER` case captures into a temporary and commits only if `_applyPenEnter` returned `true`:

  ```js
  case 'PEN_ENTER': {
    if (state.selected === null) break;
    const pending = {
      pen: new Uint8Array(state.pen),
      pencil: new Uint16Array(state.pencil),
      hintsRemaining: state.hintsRemaining,
      attemptRecorded: state.attemptRecorded,
    };
    const mutated = _applyPenEnter(state.selected, action.digit, action.fromHint ?? false);
    if (mutated) state.undoSnapshot = pending;
    // ... existing coach block, existing _emit ...
  }
  ```

  `_applyPenEnter` must return `true` at the end of its successful path and `false` (or `return;` → falsy) at each early-return guard. The `_isBoardFull()` branch chains to `ON_COMPLETION_EVALUATE` but **a mutation did occur**, so it returns `true`.

  > **Why a temporary, not `_captureUndoSnapshot()` up front:** capturing directly into `state.undoSnapshot` before the no-op check would clobber a still-valid snapshot from the *previous* real move when the user re-enters the same digit (a no-op). No-ops must not destroy the prior undo point.

- **`PENCIL_TOGGLE`** — the existing guards (`selected === null`, `!puzzle`, given cell, `pen[selected] !== 0`, `state.won`) all `break` before mutation. Call `_captureUndoSnapshot()` **immediately after the last guard, before the bit toggle**. A pencil toggle is always a real mutation once past the guards, so direct capture is safe here.

- **`ERASE`** — guards (`selected === null`, `!puzzle`, given cell, `state.won`) `break` before mutation. After the guards, `ERASE` is a no-op when the cell has neither a pen digit nor pencil marks. Capture must occur only when a branch will actually run:

  ```js
  case 'ERASE': {
    // ... existing guards ...
    const cellIdx = state.selected;
    if (state.pen[cellIdx] !== 0) {
      _captureUndoSnapshot();
      state.pen[cellIdx] = 0;
      // ... existing recompute/emit ...
    } else if (state.pencil[cellIdx] !== 0) {
      _captureUndoSnapshot();
      state.pencil[cellIdx] = 0;
      // ... existing emit ...
    }
    // empty-cell erase: no capture, no emit (existing behavior) — prior snapshot survives
    // ... existing coach COACH_END dispatch ...
  }
  ```

### 3.2 Actions that CLEAR the snapshot (`state.undoSnapshot = null`)

| Action | Reason |
|---|---|
| `UNDO` | One-level only; consuming the snapshot ends the undo chain (requirement 7). |
| `PUZZLE_LOADED` | New puzzle identity; prior board is gone. Add `state.undoSnapshot = null;` to the existing reset block. |
| `NEW_PUZZLE` | Same. Add to reset block. |
| `RESET_PUZZLE` | Board wiped to givens; undoing into a pre-reset board would be unexpected. Add to reset block. |
| `CHANGE_DIFFICULTY` | Puzzle is being replaced; a cross-puzzle undo is invalid. Add `state.undoSnapshot = null;` and add `'undoSnapshot'` to its emit. |

**Actions that explicitly do NOT touch the snapshot:** `HINT` (not an undoable move — see §4.7), `CHECK`, `SELECT_CELL`, `DESELECT`, `ARROW_NAV`, `SET_MODE`, `TOGGLE_MODE`, `CLEAR_INCORRECT`, `ON_COMPLETION_EVALUATE`, `SET_GENERATING`, and all `COACH_*` actions. Rationale: none of these is a "move" per requirement 2, and preserving the snapshot across them (e.g., the user selects a different cell, then undoes) is the desired behavior.

**Critical:** `COACH_START` and `COACH_END` mutate `pencil` (auto-reveal / revert). They must **not** capture or clear the undo snapshot. Coach pencil churn is not a user move. See §4.3 for how `UNDO`'s full `pencil` restore correctly supersedes any coach-revealed bits.

---

## 4. The `UNDO` Action

`UNDO` takes no payload: `{ type: 'UNDO' }`.

### 4.1 Guards

```js
case 'UNDO': {
  if (state.undoSnapshot === null) break;   // nothing to undo
  if (state.won === true) break;            // policy §4.6
  if (state.generating === true) break;     // defensive: no board to act on
  ...
}
```

`!state.puzzle` is implicitly covered: a snapshot can only exist if a move occurred, which requires a loaded puzzle, and `PUZZLE_LOADED`/`NEW_PUZZLE` null the snapshot.

### 4.2 Mutation sequence (exact order)

```js
const snap = state.undoSnapshot;

// 1. End any active coach session FIRST (see §4.3).
if (state.coachSession !== null) {
  state.coachSession = null;            // direct null — NOT a COACH_END dispatch
}

// 2. Restore board arrays in place (preserve typed-array identity per overview §4).
state.pen.set(snap.pen);
state.pencil.set(snap.pencil);

// 3. Restore stats fields.
state.hintsRemaining  = snap.hintsRemaining;
state.attemptRecorded = snap.attemptRecorded;

// 4. Recompute conflicts from restored pen.
state.conflicts = computeConflicts(state.pen);

// 5. Clear transient correctness highlight state.
state.incorrect = new Set();
state.incorrectShownUntil = 0;
state.completionMessage = '';
if (clearIncorrectTimer !== null) {
  clearTimeout(clearIncorrectTimer);
  clearIncorrectTimer = null;
}

// 6. Consume the snapshot — one-level only, no redo.
state.undoSnapshot = null;

// 7. selected and activeMode are deliberately untouched (§4.5).

// 8. Emit (see §10).
_emit(action, 'pen', 'pencil', 'conflicts', 'incorrect', 'incorrectShownUntil',
      'completionMessage', 'hintsRemaining', 'attemptRecorded', 'coachSession',
      'undoSnapshot');
```

`state.pen.set(...)` / `state.pencil.set(...)` mutate the existing typed arrays in place, consistent with `aspec-overview.md` §4. Do **not** replace the array objects.

### 4.3 Coach interaction — direct null, not `COACH_END`

**Decision: set `state.coachSession = null` directly. Do NOT dispatch `COACH_END`.**

Rationale:

- `COACH_END`'s only board effect is the pencil-revert formula (`aspec-coach-ui.md` §3.2/§5.4). Its purpose is to strip coach-auto-revealed bits while preserving user edits made during the session.
- `UNDO` does a **full `pencil` restore** from `snap.pencil`, which was captured before the user's last move — i.e., before the pen entry that would have triggered coach effects. Running the `COACH_END` revert formula first and then overwriting the whole array with `snap.pencil` would be a wasted first pass producing a result that step 2 entirely replaces.
- Running `COACH_END` would also emit a second, intermediate `'changed'` event with a transient half-reverted `pencil`, which UI subscribers (grid, persistence writer) would needlessly process. Direct assignment yields exactly one clean `'changed'` emit from `UNDO`.
- This mirrors the established precedent: the reducer already sets `coachSession = null` directly in `NEW_PUZZLE`/`RESET_PUZZLE`/`PUZZLE_LOADED` when `pencil` is being bulk-reset (`aspec-coach-ui.md` §4.5–4.9). `UNDO` is the same situation.

**Edge case — coach auto-reveal in snapshot:** If the user pressed Coach (auto-reveal mutated `pencil`) and then made a move, the `undoSnapshot` captures `pencil` in its post-auto-reveal state. Undoing restores `pencil` to that state (auto-revealed marks visible) with the coach panel dismissed. This is correct: the user is returned to exactly the board state that existed immediately before their last move, and the coach session is dismissed per requirement 6.

Requirement 6 is satisfied: `'coachSession'` in the emit causes `coach.js` to tear down its panel/overlay/recap on the next render.

### 4.4 `incorrect` / `incorrectShownUntil` / timer

Cleared, not restored. The pending `clearIncorrectTimer` is cancelled so a queued `CLEAR_INCORRECT` cannot fire against the post-undo state and emit a spurious second event. This matches the existing timer-cleanup idiom used in `PUZZLE_LOADED`/`NEW_PUZZLE`/`RESET_PUZZLE`.

### 4.5 `selected` and `activeMode`

**Both preserved** (untouched by the handler). The user stays focused on the same cell and in the same pen/pencil mode. This keeps the post-undo experience continuous and matches the no-focus-transfer toolbar philosophy.

### 4.6 Won-state policy — undo BLOCKED while `won === true`

**Decision: `UNDO` is a no-op when `state.won === true`.**

Rationale:
1. **Persistence consistency.** Reaching a win clears `sudoku.state.v1`. Un-winning would leave the app in a won-then-edited state with no persisted blob — a state the persistence model does not represent.
2. **Stats integrity.** `recordWin` already fired. There is no `recordWin`-decrement primitive, and adding one is undesirable.
3. **UX.** The win banner has appeared; silently editing the board behind the banner is confusing. Requirement 7 already anticipates this: "The user can redo manually if desired."
4. **Symmetry.** `PEN_ENTER`/`PENCIL_TOGGLE`/`ERASE`/`HINT` all guard on `state.won` and become no-ops.

Consequence: the move that triggers the win cannot be undone. `RESET_PUZZLE` or `NEW_PUZZLE` are the supported paths. **Confirmed by user 2026-05-17.**

### 4.7 Stats fields — `hintsRemaining` and `attemptRecorded`

**`hintsRemaining`:** Snapshotted and restored, but the restore is a **no-op in practice**. Only `HINT` changes `hintsRemaining`, and `HINT` is not an undoable move and never captures a snapshot. Therefore at the moment `UNDO` runs, `state.hintsRemaining === snap.hintsRemaining` always. Capturing and restoring it unconditionally is self-documenting and avoids a fragile implicit assumption.

**`attemptRecorded`:** Snapshotted and restored in-memory. If the user's first `PEN_ENTER` flipped `attemptRecorded` false→true (and fired `stats.recordAttemptOnce`), undoing that first move restores `attemptRecorded` to `false`, so the in-memory `GameState` is internally consistent. **Caveat — the stats cookie is intentionally NOT decremented.** There is no `recordAttempt`-decrement primitive. The net effect: an undone-but-real first move still increments the cookie counter — consistent with the existing resume/reset stats semantics already accepted in `aspec-persistence.md` §3.4. The Implementor must **not** add stats-rollback wiring to `UNDO`.

---

## 5. Button State Rules

A new button `#btn-undo` (class `btn btn-undo`) is rendered by `numpad.js`. State managed in `numpad.js`'s `_update`:

```js
const undoBtn = _root.querySelector('#btn-undo');
if (undoBtn) {
  undoBtn.disabled =
    state.undoSnapshot === null || state.won === true || state.generating === true;
}
```

`RELEVANT_KEYS` in `numpad.js` must gain `'undoSnapshot'` and `'generating'`. (`'won'` is already present.) Without `'undoSnapshot'` in `RELEVANT_KEYS`, `_update` would not re-run when the snapshot is created/consumed and the button would not enable/disable correctly.

**Click handler** (added in `_buildNumpad`):

```js
_root.querySelector('#btn-undo').addEventListener('click', () => {
  const s = _gameState.getState();
  if (s.undoSnapshot === null || s.won || s.generating) return;
  _gameState.dispatch({ type: 'UNDO' });
  announce('Last move undone');   // §8
});
```

**Toolbar focus pattern:** automatic. The existing `_root.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()))` loop runs after the template is injected, so `#btn-undo` receives the `mousedown` preventDefault with no extra code — same mechanism as `#btn-coach` (`aspec-coach-ui.md` §10.2).

---

## 6. Keyboard Shortcut

Added to the global `keydown` handler in `js/ui/keyboard.js`. Place the block **before** the digit-keys block.

```js
// Undo: Ctrl+Z (Win/Linux) or Cmd+Z (Mac). Single-level; no redo.
if ((e.key === 'z' || e.key === 'Z') &&
    (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
  const tag = document.activeElement?.tagName ?? '';
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
  const state = gameState.getState();
  if (state.undoSnapshot === null || state.won === true || state.generating === true) {
    return;  // do not preventDefault — let the browser keep native Ctrl+Z if any
  }
  e.preventDefault();
  gameState.dispatch({ type: 'UNDO' });
  return;
}
```

Notes:
- **Cmd vs Ctrl:** `e.metaKey` is Cmd on macOS; `e.ctrlKey` is Ctrl on Windows/Linux. `e.ctrlKey || e.metaKey` covers both platforms without UA sniffing.
- **`!e.shiftKey`:** Ctrl/Cmd+Shift+Z is the conventional redo chord. Since there is no redo (requirement 7), this combination is not consumed — it falls through to browser default.
- **Focus guard:** excludes `INPUT/SELECT/TEXTAREA/BUTTON`, consistent with the existing `P`-key guard in `keyboard.js`.
- **No `preventDefault` when guarded off:** if undo is unavailable, the event is not consumed, leaving native browser behavior intact for any focused editable context.
- **SR announcement from keyboard path:** not emitted (the keyboard handler does not announce; announcements are owned by the numpad button handler per existing `keyboard.js` convention — see §8).

`keyboard.js`'s `mount(root, gameState)` signature is unchanged.

---

## 7. HTML / CSS Changes

### 7.1 `numpad.js` template

Insert a new row **between** `.numpad-utils` (Erase/Mode row) and `.numpad-bottom-row1` (Hint/Coach row). The post-coach template bottom becomes:

```html
<div class="numpad-utils">
  <button class="btn" id="btn-erase" aria-label="Erase selected cell">Erase</button>
  <button class="btn btn-mode mode-pen" id="btn-mode" ...>...</button>
</div>
<div class="numpad-undo-row">
  <button class="btn btn-undo" id="btn-undo" aria-label="Undo last move" disabled>Undo</button>
</div>
<div class="numpad-bottom-row1">
  <button class="btn btn-hint" id="btn-hint" aria-label="Hint">
    Hint <span class="hint-badge" id="hint-count">0</span>
  </button>
  <button class="btn btn-coach" id="btn-coach" aria-label="Coach">Coach</button>
</div>
<div class="numpad-bottom-row2">
  <button class="btn btn-check" id="btn-check" aria-label="Check answers">Check</button>
</div>
```

The button ships with the `disabled` attribute in the template (correct initial state: no snapshot at mount; also satisfies requirement 8 after refresh). `_update` overrides it on every relevant `'changed'`.

### 7.2 `css/controls.css`

Add a full-width row rule immediately after the `.numpad-bottom-row2` rules:

```css
.numpad-undo-row {
  width: 100%;
}

.numpad-undo-row .btn-undo {
  width: 100%;
}
```

No new theme custom properties are needed — `.btn-undo` inherits the standard `.btn` appearance and the existing `.btn:disabled` styling. No `themes.css` change.

---

## 8. SR Announcement

On a successful undo, `numpad.js`'s click handler calls `announce('Last move undone')` (via the existing `import { announce } from './srLive.js'`).

- **Text: "Last move undone"** — concise, unambiguous. No cell coordinates: a single undo can revert multiple cells (e.g., a `PEN_ENTER` that auto-cleared several peer pencil marks), so naming one cell would mislead.
- **Keyboard path does not announce.** Consistent with `keyboard.js`'s existing convention (digit/erase/arrow handlers do not announce). If SR feedback for the keyboard path is later desired, a shared helper can be added without architectural change.

---

## 9. Persistence Interaction

- **Snapshot is NOT persisted.** The persistence writer serializes only `{ puzzle, pen, pencil, hintsRemaining, attemptRecorded }` (`aspec-persistence.md` §10.2). `undoSnapshot` is excluded by omission. **No change to `aspec-persistence.md` or the persistence writer is required.**
- **Restored state IS persisted.** `UNDO`'s `_emit` includes `'pen'`, `'pencil'`, `'hintsRemaining'`, `'attemptRecorded'`, which intersects the persistence writer's trigger set. The writer therefore schedules its normal debounced write with the reverted board. No new persistence wiring; the existing subscriber handles it.
- **No-op `UNDO` does not emit**, so it does not trigger a persistence write.

---

## 10. Emit Keys

### 10.1 `UNDO`

```js
_emit(action, 'pen', 'pencil', 'conflicts', 'incorrect', 'incorrectShownUntil',
      'completionMessage', 'hintsRemaining', 'attemptRecorded', 'coachSession',
      'undoSnapshot');
```

Why each key:
- `pen`, `pencil` — board restored (grid re-render; persistence).
- `conflicts` — recomputed (grid conflict styling).
- `incorrect`, `incorrectShownUntil`, `completionMessage` — cleared (grid highlight clear).
- `hintsRemaining`, `attemptRecorded` — restored (persistence + hint badge; no-op in practice per §4.7).
- `coachSession` — set to `null` (coach.js tears down panel/overlay/recap — requirement 6).
- `undoSnapshot` — set to `null` (numpad re-renders Undo button to disabled — requirement 7).

A no-op `UNDO` (guard fails with `break`) emits nothing.

### 10.2 Move actions when they capture a snapshot

Add `'undoSnapshot'` to the existing `_emit` change-sets for the mutating paths:

- **`PEN_ENTER`** — add `'undoSnapshot'` to the existing `_emit` in the `PEN_ENTER` case. This emit runs even in the board-full/chained-`ON_COMPLETION_EVALUATE` path (verify: `_applyPenEnter` returning does not skip the `PEN_ENTER` case's trailing `_emit`; only an early `break` on `state.selected === null` would).
- **`PENCIL_TOGGLE`** — existing emit: `_emit(action, 'pencil')`. Change to: `_emit(action, 'pencil', 'undoSnapshot')`.
- **`ERASE`** — both mutating branches (pen-erase and pencil-erase) get `'undoSnapshot'` added. The empty-cell no-op path emits nothing and must stay that way.

### 10.3 Snapshot-clearing actions

Add `'undoSnapshot'` to the existing `_emit` calls for: `PUZZLE_LOADED`, `NEW_PUZZLE`, `RESET_PUZZLE`, `CHANGE_DIFFICULTY`.

---

## 11. Test Implications

### 11.1 New unit tests — `js/tests/unit/state.test.js`

Add a `describe('UNDO')` block:

1. **U1** — `PEN_ENTER` on empty cell sets `undoSnapshot`; snapshot `pen`/`pencil` equal pre-move arrays (deep value compare, not reference).
2. **U2** — `UNDO` restores `pen` and `pencil` to pre-`PEN_ENTER` values; `undoSnapshot` becomes `null` after.
3. **U3 (critical case)** — set pencil candidate `d` in several peers, `PEN_ENTER d` into a cell (auto-clears peers), `UNDO` restores all peer pencil marks exactly.
4. **U4** — `conflicts` recomputed after undo: create a duplicate (conflict on two cells), undo the second entry, assert `conflicts` empty.
5. **U5** — `PENCIL_TOGGLE` sets snapshot; `UNDO` reverts the single bit.
6. **U6** — `ERASE` of a pen digit sets snapshot; `UNDO` restores the digit and recomputes conflicts.
7. **U7** — `ERASE` of pencil marks sets snapshot; `UNDO` restores them.
8. **U8 (no-op preservation)** — `PEN_ENTER d` (real), then `PEN_ENTER d` again (no-op, same digit): `undoSnapshot` still reflects the first pre-move state; one `UNDO` returns to before the first entry.
9. **U9 (no-op preservation)** — `ERASE` on an already-empty cell does not overwrite an existing snapshot.
10. **U10 (one-level only)** — two `PEN_ENTER`s, one `UNDO` reverts the second only; a second consecutive `UNDO` is a no-op (guard `undoSnapshot === null`), state unchanged, no emit.
11. **U11 (won block, §4.6)** — drive a board to a win; `UNDO` while `won === true` is a no-op (assert board unchanged, `won` still `true`).
12. **U12 (HINT not undoable)** — `HINT` does not set `undoSnapshot`; if a prior `PEN_ENTER` set one, `HINT` leaves it intact and `UNDO` reverts the pen entry, not the hint.
13. **U13 (attemptRecorded restore)** — first-ever `PEN_ENTER` flips `attemptRecorded` true; `UNDO` restores it to `false`; assert `state.attemptRecorded === false` (the stats cookie is not decremented — no stats spy assertion required, documented as known accepted behavior).
14. **U14 (coach interaction)** — start a coach session (auto-reveal mutates `pencil`), make a `PEN_ENTER`, `UNDO`: `coachSession === null`, `pencil` restored to the pre-move (post-auto-reveal) snapshot, exactly one `'changed'` emit from `UNDO` carrying `'coachSession'` and `'undoSnapshot'`.
15. **U15 (snapshot cleared by lifecycle)** — `PEN_ENTER`, then each of `NEW_PUZZLE` / `RESET_PUZZLE` / `PUZZLE_LOADED` / `CHANGE_DIFFICULTY`: each clears `undoSnapshot` to `null`; subsequent `UNDO` is a no-op.
16. **U16 (coach pencil churn does not capture)** — `COACH_START` then `COACH_END` with no user move in between: `undoSnapshot` stays `null`.
17. **U17 (incorrect cleared + timer cancelled)** — trigger a `CHECK` that sets `incorrect` and schedules `clearIncorrectTimer`; perform a move + `UNDO`; assert `incorrect` empty, `incorrectShownUntil === 0`, and (via fake timers) the queued `CLEAR_INCORRECT` does not later fire a spurious emit.
18. **U18 (emit keys)** — assert the `UNDO` emit `changed` Set equals exactly the set in §10.1; assert `PEN_ENTER`/`PENCIL_TOGGLE`/`ERASE` mutating emits include `'undoSnapshot'`.
19. **U19 (generating guard)** — with `state.generating === true` and a snapshot present, `UNDO` is a no-op.

### 11.2 Integration tests — `js/tests/integration/game-flows.test.js`

Append (continuing the existing `GF#` numbering):

- **GF15** — Numpad Undo button: disabled at load; after a pen entry it enables; clicking it reverts the board and the button re-disables; `srLive` region announces "Last move undone".
- **GF16** — Critical auto-clear case end-to-end: pencil-mark several peers, pen a digit (peers visibly clear), click Undo, assert peer pencil marks reappear in the rendered grid DOM.
- **GF17** — Coach + Undo: open Coach (panel visible), make the coached pen entry, Ctrl+Z (synthesize `keydown` with `ctrlKey`), assert coach panel/overlay removed from DOM and board reverted.
- **GF18** — Keyboard: Ctrl+Z and Cmd+Z (metaKey) both dispatch undo; guard: with focus inside a `BUTTON` the shortcut does not fire; after win, Ctrl+Z is inert and the win banner stays.
- **GF19** — Session-only: simulate restore (fresh mount with persisted `sudoku.state.v1`); assert Undo button starts disabled (`undoSnapshot === null`) even though `pen`/`pencil` were restored.

### 11.3 a11y test — `js/tests/integration/a11y.test.js`

Add an assertion that `#btn-undo` has `aria-label="Undo last move"` and that its `disabled` attribute toggles in step with `undoSnapshot`.

All tests run under the existing Mocha/Chai + Playwright harness. **100% branch coverage required** (`aspec-overview.md` §7.2). New branches: `UNDO` guards (×3), `_applyPenEnter`'s new boolean returns, the `ERASE` per-branch capture, the no-op preservation paths, the keyboard modifier combinations — each needs an exercising test above.

---

## 12. Implementation Sequence

This is **Phase 9**, appended to `aspec-overview.md` §8. Add a one-line entry to the Feature Spec Index:

| File | Contents | Loaded by |
|---|---|---|
| `aspec-undo.md` | One-level undo — `undoSnapshot` field, `UNDO` action, numpad button, Ctrl/Cmd+Z | Implementor (Phase 9), Reviewer, QE |

**Sequence:**

1. `js/game/state.js` — add `undoSnapshot: null` to initial state and `UndoSnapshot` typedef; add `_captureUndoSnapshot()` helper; modify `_applyPenEnter` to return a boolean; add snapshot capture to `PEN_ENTER`/`PENCIL_TOGGLE`/`ERASE`; add `UNDO` case; add `undoSnapshot` clearing and `'undoSnapshot'` emit key to `PUZZLE_LOADED`/`NEW_PUZZLE`/`RESET_PUZZLE`/`CHANGE_DIFFICULTY`; add `'undoSnapshot'` to the three move-action emits.
2. `js/tests/unit/state.test.js` — U1–U19.
3. `js/ui/numpad.js` — add `.numpad-undo-row` / `#btn-undo` to template; add click handler; add `undoBtn.disabled` logic to `_update`; add `'undoSnapshot'` and `'generating'` to `RELEVANT_KEYS`.
4. `css/controls.css` — add `.numpad-undo-row` / `.btn-undo` rules.
5. `js/ui/keyboard.js` — add Ctrl/Cmd+Z block.
6. `js/tests/integration/game-flows.test.js` — GF15–GF19.
7. `js/tests/integration/a11y.test.js` — Undo button a11y assertion.
8. Run full suite; confirm 100% branch coverage; manual smoke per `aspec-overview.md` §9.2.

No deployment-procedure change — `deploy.txt` already enumerates `js/`, `css/`, `index.html`; no new files.
