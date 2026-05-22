# Architectural Spec — Coach Mode UI and State Integration
**ID:** aspec-coach-ui
**Status:** Final (amended 2026-05-04)
**Date:** 2026-05-04
**Author:** Architect

> **Amendment 2026-05-04:** (1) Added `eliminationTargets` field to `CoachSession` (§2.1). (2) Extended `COACH_START` handler to compute `eliminationTargets` and updated `analyze()` call to pass `pencil` (§3.1). (3) Added `PENCIL_TOGGLE` hook for elimination completion detection (§4.3). (4) Extended `COACH_FILL_RECAP` to accept `variant: 'elim'` with pencil-adoption behavior (§3.3). (5) Added elim recap variant to `_showRecap` and `_composeElimRecapDetail` helper (§6.10). (6) Updated test strategy (§16.1, §16.2).

> **Amendment 2026-05-14:** Fixed Hidden Pair / Hidden Triple elimination completion. These techniques set `roles.elimTarget = []` because their eliminations happen within the cause cells, not in external cells. The original `eliminationTargets` construction iterated `roles.elimTarget` and produced an empty Map, causing `Array.every()` on an empty iterable to return `true` immediately — the elim recap fired on the first pencil toggle. Fix: when `roles.elimTarget` is empty, build per-cell bitmasks from `result.eliminations` instead. Updated §2.1 (`eliminationTargets` field description), §3.1 (COACH_START step 3 code), and §6.10 (`_composeElimRecapDetail` cell-count fix).

**Loaded by:** Implementor (Phase 8b — Coach Mode), Reviewer, QE Test Writer, QE Test Runner. This is the second of two Coach Mode specs; load `aspec-coach-analyzer.md` first for the sealed `CoachStep` schema this spec consumes.

> **Also load:** `aspec-overview.md` — for the master directory tree, event-flow diagram, and cross-cutting conventions.
> **Also load:** `aspec-coach-analyzer.md` — for the sealed `CoachStep` schema, `Arrow` shape, `NoTechniqueResult`, and `analyze()` entry point. This spec must not modify those.
> **Also load:** `aspec-game-state.md` (§1.2 bootstrap, §4.2 GameState shape, §5 actions) — for the reducer this spec extends.
> **Also load:** `aspec-ui.md` (§1, §2, §10) — for the UI module pattern, mount-point conventions, and `srLive.js` API.
> **Also load:** `aspec-hints.md` (§2) — for the hint-button rules; coach button rules differ and are spelled out here.
> **Also load:** `fspec-002-coach.md` — functional source of truth.
> **Also load:** `vspec-002-coach.md` — visual source of truth.

> **Schema lock.** `CoachStep`, `Arrow`, and `NoTechniqueResult` are sealed by `aspec-coach-analyzer.md` §3, §3.2, §9. This spec uses them verbatim. Any change requires re-opening the analyzer spec via Orchestrator approval.

---

## Table of Contents

1. [Scope and Module Boundaries](#1-scope-and-module-boundaries)
2. [`CoachSession` Slice on `GameState`](#2-coachsession-slice-on-gamestate)
3. [Coach Action Catalogue](#3-coach-action-catalogue)
4. [Reducer Interaction with Existing Actions](#4-reducer-interaction-with-existing-actions)
5. [Pencil Snapshot and Revert](#5-pencil-snapshot-and-revert)
6. [Module — `js/ui/coach.js`](#6-module--jsuicoachjs)
7. [Module — `js/ui/coachOverlay.js`](#7-module--jsuicoachoverlayjs)
8. [`index.html` Additions](#8-indexhtml-additions)
9. [`main.js` Bootstrap Changes](#9-mainjs-bootstrap-changes)
10. [Numpad Layout Restructuring](#10-numpad-layout-restructuring)
11. [CSS Additions](#11-css-additions)
12. [Accessibility Wiring](#12-accessibility-wiring)
13. [Timer and Lifecycle Management](#13-timer-and-lifecycle-management)
14. [Directory Tree Delta](#14-directory-tree-delta)
15. [Implementation Sequence](#15-implementation-sequence)
16. [Test Strategy](#16-test-strategy)
17. [Non-Goals and Boundaries](#17-non-goals-and-boundaries)

---

## 1. Scope and Module Boundaries

This spec defines everything Coach Mode requires beyond the analyzer:

- The `coachSession` slice of `GameState` and the actions that mutate it.
- Cross-action obligations imposed on existing actions (`PEN_ENTER`, `ERASE`, `HINT`, `NEW_PUZZLE`, `RESET_PUZZLE`, `CHANGE_DIFFICULTY`, `PUZZLE_LOADED`, `ON_COMPLETION_EVALUATE`).
- The pencil-mark snapshot/restore mechanism (`fspec-002-coach.md` §2.3, §6.4).
- Two new UI modules: `js/ui/coach.js` (button, panel, recap, error toast, lifecycle) and `js/ui/coachOverlay.js` (SVG arrows).
- DOM additions in `index.html`, mount-order placement in `js/main.js`, numpad layout restructuring, and CSS rules in `controls.css` and `grid.css`.
- Accessibility wiring for coached cells, the explanation panel, and the recap/error toasts via the existing `srLive` region.
- Test strategy across reducer unit tests and Playwright integration tests.

### 1.1 What this spec does NOT define

- The analyzer module itself (`aspec-coach-analyzer.md`).
- The `CoachStep` / `Arrow` / `NoTechniqueResult` schemas (sealed in §3 / §3.2 / §9 of the analyzer spec).
- Theme-color values (vspec §1) — referenced here only as `var(--coach)`, `var(--coach-light)`, `var(--coach-mid)`.
- Mobile breakpoints (vspec §13).

### 1.2 Module-coupling rule

`coach.js` is the only UI module that imports `analyze` from `js/coach/analyzer.js`. The reducer does not import the analyzer. The reducer never calls the analyzer; `coach.js` calls it and dispatches the result. This keeps the reducer pure (no provider dependency) and the analyzer independently testable.

---

## 2. `CoachSession` Slice on `GameState`

### 2.1 Shape (binding)

The analyzer spec §10.2 suggested a slice; the binding shape is:

```js
GameState.coachSession =
  | null                                       // no session active
  | {
      // --- analyzer payload ----------------------------------------------
      step: CoachStep,                         // the analyzer's return; never mutated

      // --- derived sets (computed once at session start) -----------------
      coachedCells: Set<int>,                  // union of step.roles cells; see §2.3

      // --- focus tracking ------------------------------------------------
      focusedCoachedCell: int | null,          // which coached cell currently selected;
                                               // null when state.selected is not coached

      // --- pencil revert payload ----------------------------------------
      pencilSnapshot: Uint16Array(81),         // pencil[] at COACH_START time
      coachRevealedBits: Uint16Array(81),      // bits added by coach auto-reveal per cell

      // --- elimination completion tracking (computed once at COACH_START) --
      eliminationTargets: Map<int, int> | null,
                                               // For elimination techniques: maps each
                                               // affected cell index to the bitmask of
                                               // digits that must be cleared from pencil.
                                               // Built from roles.elimTarget for most
                                               // techniques; built from result.eliminations
                                               // for Hidden Pair / Hidden Triple (which set
                                               // roles.elimTarget = [] because eliminations
                                               // happen within the cause cells).
                                               // null for placement techniques (ranks 1–2).
                                               // Never mutated after COACH_START.

      // --- recap state ---------------------------------------------------
      recap: 'normal' | 'error' | 'elim' | null,
                                               // active recap variant; null while highlights
                                               // are showing
    }
```

`null` is the canonical "no session" sentinel. The reducer never assigns `undefined` to `coachSession` — it always assigns either a fully-populated object or `null`.

### 2.2 New `GameState` field

The slice is added to the existing `GameState` shape (`aspec-game-state.md` §4.2) as a new optional field:

```js
GameState = {
  // ... all existing fields unchanged ...
  coachSession: CoachSession | null,           // NEW — initialized to null
}
```

`createGameState({ stats, hintProvider })` initializes `state.coachSession = null` alongside the other initial-state assignments. No new constructor argument is added.

### 2.3 `coachedCells` derivation

`coachedCells` is the deduplicated union of every cell index that carries any `.coached-*` CSS class for the current step:

```js
function deriveCoachedCells(step) {
  const set = new Set();
  if (step.roles.target !== null) set.add(step.roles.target);
  for (const c of step.roles.cause)        set.add(c);
  for (const c of step.roles.elimTarget)   set.add(c);
  for (const c of step.roles.unitMember)   set.add(c);
  for (const c of step.roles.scA)          set.add(c);
  for (const c of step.roles.scB)          set.add(c);
  return set;
}
```

This is the set the reducer uses to decide whether a `PEN_ENTER` lands "on a coached cell" and the set `coach.js` consults to decide whether to open the explanation panel on focus changes. It is computed once in the `COACH_START` handler and never recomputed during the session — the step does not change while a session is active (a `COACH_START` always follows a `COACH_END` per §3).

### 2.4 Reads from existing state

The coach-related reducer logic reads (does not write) the following existing `GameState` fields:

| Field | Used for |
|---|---|
| `puzzle` | passed to `analyze()`; cleared on `PUZZLE_LOADED` triggers session end |
| `pen`, `conflicts` | passed to `analyze()` as `playerState` |
| `pencil` | snapshotted on `COACH_START`; diffed and reverted on `COACH_END` |
| `selected` | drives coached-cell focus tracking via `coach.js` (UI layer) |
| `won`, `winHandled` | win precedes recap; see §4 |

The coach state never writes to `puzzle`, `pen`, `conflicts`, `incorrect`, `selected`, `activeMode`, `hintsRemaining`, or any other v1 field. The only field it writes to outside its own slice is `pencil`, and only when `COACH_START` auto-reveal applies marks or `COACH_END` reverts them (§5).

---

## 3. Coach Action Catalogue

All coach-related state transitions go through `dispatch(action)` on the reducer constructed by `createGameState`. Six new action types are introduced. Two of them (`COACH_START` and `COACH_END`) are dispatched by `coach.js`; the remaining four (`COACH_FOCUS_COACHED_CELL`, `COACH_FOCUS_OFF`, `COACH_RECAP_DISMISS`, `COACH_ERROR_TOAST_DISMISS`) are also dispatched by `coach.js` from its own timers and focus observers.

### 3.1 `COACH_START` — `{ result: CoachStep | NoTechniqueResult }`

**Dispatched by:** `coach.js` after calling `analyze(state.puzzle, { pen: state.pen, conflicts: state.conflicts, pencil: state.pencil })`.

**Guards:**
1. If `state.puzzle === null`, no effect.
2. If `state.won === true`, no effect.

**Mutation when `result.type === 'no-technique'`:**

The reducer treats this as a no-op on `coachSession`. The error toast is purely a `coach.js` concern (it manages its own timer; see §13). The reducer simply emits a no-op-relevant change so subscribers can observe the dispatch:

- `state.coachSession` is unchanged (already `null` if previously idle; or per §3.2 cleared if a previous session had been active — but `coach.js` always dispatches `COACH_END` before `COACH_START` per §6.6, so the slice should be `null` at this point).
- Emits: `'coachSession'` with no shape change (the change-key is included so `coach.js` can react if needed; `coach.js` actually reacts to its own pre-dispatch result, so this emit is informational).

**Mutation when `result` is a `CoachStep`:**

If a previous session is active (`state.coachSession !== null`), the reducer first revert-restores pencil marks per §5.4 and then proceeds. (`coach.js` is required to dispatch `COACH_END` first per §6.6, so this path is a defensive fallback; the reducer must still handle it correctly.)

1. Snapshot `pencil[]`:
   ```js
   const snapshot = new Uint16Array(state.pencil);   // copy
   ```
2. Apply auto-reveal (only when `result.autoReveal.required`):
   ```js
   const coachRevealedBits = new Uint16Array(81);
   if (result.autoReveal.required) {
     for (const { cellIndex, candidates } of result.autoReveal.cells) {
       const before = state.pencil[cellIndex];
       const after = before | candidates;             // union with computed candidates
       coachRevealedBits[cellIndex] = after & ~before; // bits the coach added
       state.pencil[cellIndex] = after;
     }
   }
   ```
   Auto-reveal is the **only** time the coach writes to `state.pencil`. Even ranks 1–2 (`autoReveal.required === false`) do not touch `pencil`. The `coachRevealedBits` array is all-zeros for rank 1–2 sessions.
3. Compute `eliminationTargets` for elimination techniques:
   ```js
   const eliminationTargets = (result.type === 'elimination')
     ? (() => {
         const m = new Map();
         if (result.roles.elimTarget.length > 0) {
           // Most techniques: all elim-target cells lose the same digit set.
           const digitBits = result.digits.reduce((b, d) => b | (1 << (d - 1)), 0);
           for (const c of result.roles.elimTarget) m.set(c, digitBits);
         } else {
           // Hidden Pair / Hidden Triple: roles.elimTarget is empty because
           // eliminations happen within the cause cells. Build per-cell bitmasks
           // from the individual elimination entries instead.
           for (const { cellIndex, digit } of result.eliminations) {
             m.set(cellIndex, (m.get(cellIndex) ?? 0) | (1 << (digit - 1)));
           }
         }
         return m;
       })()
     : null;
   ```
4. Construct the slice:
   ```js
   state.coachSession = {
     step: result,
     coachedCells: deriveCoachedCells(result),
     focusedCoachedCell:
       state.selected !== null && coachedCells.has(state.selected) ? state.selected : null,
     pencilSnapshot: snapshot,
     coachRevealedBits,
     eliminationTargets,
     recap: null,
   };
   ```
5. Emits: `'coachSession', 'pencil'` (the second only if `autoReveal.required` and at least one bit was added; emitting unconditionally is also acceptable — UI subscribers short-circuit on irrelevant changes per `aspec-ui.md` §1).

**`focusedCoachedCell` initialization:** if the user has a coached cell already selected at the moment Coach is pressed, the panel should open immediately. The reducer initializes `focusedCoachedCell` accordingly so `coach.js` can render the panel on its first render after `COACH_START`.

### 3.2 `COACH_END` — `{ reason: string }`

**Dispatched by:** `coach.js` (and by the reducer itself from the cross-action handlers in §4 — see "internal dispatch" rule in §3.7).

**`reason` values** (informational; the reducer behaves identically for all):
- `'session-reset'` — Coach pressed again
- `'fill-coached-correct'` — placement, correct fill (recap-bound; see §3.3)
- `'fill-coached-wrong'` — placement, wrong fill (recap-bound)
- `'fill-coached-elim'` — elimination, any fill (silent end)
- `'fill-non-coached'` — non-coached cell fill (silent end)
- `'erase'` — erase fired
- `'hint'` — hint filled coached cell
- `'puzzle-replaced'` — `NEW_PUZZLE` / `RESET_PUZZLE` / `CHANGE_DIFFICULTY` / `PUZZLE_LOADED`
- `'won'` — `ON_COMPLETION_EVALUATE` produced a win
- `'recap-timeout'` — fired by `coach.js` 2.5s after the recap opened
- `'error-toast-timeout'` — fired by `coach.js` 5s after no-technique result

**Guards:** none — the action is always allowed; the handler short-circuits when `coachSession === null`.

**Mutation when `coachSession === null`:** no-op; emit nothing.

**Mutation when `coachSession !== null`:**

1. Revert pencil marks per §5.4:
   ```js
   for (let i = 0; i < 81; i++) {
     const revealed = state.coachSession.coachRevealedBits[i];
     if (revealed === 0) continue;
     // Preserve any user changes; remove only coach-added bits.
     const snapshot = state.coachSession.pencilSnapshot[i];
     const current = state.pencil[i];
     state.pencil[i] = (snapshot & ~revealed) | (current & ~revealed);
   }
   ```
2. Set `state.coachSession = null`.
3. Emits: `'coachSession', 'pencil'`.

The reducer does not auto-clear pencil marks during the revert — auto-clear only fires on pen entry (`aspec-game-state.md` §5, PEN_ENTER step 7). Reverting auto-reveal is purely a candidate-bit restoration.

### 3.3 `COACH_FILL_RECAP` — `{ variant: 'normal' | 'error' | 'elim' }`

**Dispatched by:**
- The reducer itself, from its `PEN_ENTER` handler when the filled cell is a coached cell on a placement-technique session (§4.1) — `variant: 'normal'` or `'error'`.
- The reducer itself, from its `PENCIL_TOGGLE` handler when all elimination targets are cleared (§4.3) — `variant: 'elim'`.

This action exists so the reducer can transition `coachSession` from "highlights-active" to "recap-showing" atomically with the action that triggered the recap. It cannot be done from `coach.js` because the reducer must finish the originating mutation (pen entry, pencil toggle) before `coach.js` even sees the `'changed'` event. Pulling it into the reducer keeps the lifecycle sequence deterministic.

**Guards:**
1. If `coachSession === null`, no effect.
2. If the slice is already in recap (`coachSession.recap !== null`), no effect.

**Mutation for `variant: 'normal'` and `variant: 'error'` (unchanged behavior):**

1. Revert pencil marks per §5.4 (same as `COACH_END` step 1). The recap phase has no highlights and no auto-reveal — once the user has filled the coached cell, the auto-revealed marks are no longer needed.
2. Zero out the `coachedCells` set effectively by clearing the slice's coached-cell role: assign `state.coachSession.coachedCells = new Set()`. This signals to `grid.js` and `coach.js` that no `.coached-*` classes should be applied during the recap. (The slice is still non-null, so `coachSession !== null` remains true; `coach.js` keeps the recap toast visible.)
3. Set `state.coachSession.recap = action.variant`.
4. Set `state.coachSession.focusedCoachedCell = null` (no panel during recap).
5. Set `state.coachSession.coachRevealedBits = new Uint16Array(81)` (already-reverted; further `COACH_END` revert becomes a no-op).
6. Emits: `'coachSession', 'pencil'`.

**Mutation for `variant: 'elim'` (pencil adoption — no revert):**

For elimination techniques the user applied manually via pencil, the coach-revealed marks become theirs to keep. The auto-reveal revert does **not** run.

1. **Do not run the pencil revert** (§5.4). Instead, adopt remaining coach-revealed marks by zeroing `coachRevealedBits`:
   ```js
   state.coachSession.coachRevealedBits = new Uint16Array(81);
   ```
   Since the revert loop in §3.2 skips cells where `revealed === 0`, this zeroed array makes any subsequent `COACH_END` revert a no-op. The user's pencil state is therefore preserved as-is.
2. Assign `state.coachSession.coachedCells = new Set()` (highlights clear, same as other variants).
3. Set `state.coachSession.recap = 'elim'`.
4. Set `state.coachSession.focusedCoachedCell = null` (no panel during recap).
5. Emits: `'coachSession'` (no `'pencil'` emit — pencil is unchanged for the elim variant).

The recap auto-dismiss timer (2.5s) is started by `coach.js` on observing `coachSession.recap !== null` in the `'changed'` event. When the timer fires, `coach.js` dispatches `COACH_END { reason: 'recap-timeout' }`, which sets `coachSession = null` (the revert in step 1 of `COACH_END` is a no-op because `coachRevealedBits` is now all-zero for all variants).

### 3.4 `COACH_FOCUS_COACHED_CELL` — `{ index: int }`

**Dispatched by:** `coach.js` when it observes `state.selected` change to a coached cell.

**Guards:**
1. If `coachSession === null`, no effect.
2. If `coachSession.recap !== null`, no effect (no panel during recap).
3. If `index` is not in `coachSession.coachedCells`, no effect.

**Mutation:**
- `state.coachSession.focusedCoachedCell = index`.
- Emits: `'coachSession'`.

### 3.5 `COACH_FOCUS_OFF`

**Dispatched by:** `coach.js` when it observes `state.selected` change to a non-coached cell, to `null`, or to a control element (focus left the grid).

**Guards:**
1. If `coachSession === null`, no effect.
2. If `coachSession.focusedCoachedCell === null`, no effect.

**Mutation:**
- `state.coachSession.focusedCoachedCell = null`.
- Emits: `'coachSession'`.

### 3.6 `COACH_NO_TECHNIQUE` — `{ reason: 'complete' | 'error' | 'inconsistent' }`

**Dispatched by:** `coach.js` after `analyze()` returns a `NoTechniqueResult`.

**Guards:** none.

**Mutation:**
- `state.coachSession` remains `null`.
- Emits: `'coachSession'` (informational; the change-set still announces a coach action so the persistence subscriber can ignore it cleanly).

`coach.js` mounts the error toast itself in response to this dispatch (it does not need to re-read state — it already has the result in hand). The reducer's role is informational: this action exists so cross-cutting subscribers (logging, future telemetry) see a coherent action stream.

### 3.7 Internal-dispatch rule

The reducer is allowed to dispatch `COACH_END` and `COACH_FILL_RECAP` from inside other action handlers (e.g., `PEN_ENTER` calls `dispatch({ type: 'COACH_END', reason: 'fill-non-coached' })`). The existing reducer already dispatches internally (`PEN_ENTER` chains to `ON_COMPLETION_EVALUATE` per `aspec-game-state.md` §5). The pattern is permitted.

The internal dispatch produces a separate `'changed'` emit, which is what subscribers want — they see the coach session disappear in its own event, distinguishable from the pen entry.

---

## 4. Reducer Interaction with Existing Actions

The reducer is the authoritative location for cross-action coach effects. UI modules must not implement session-clearing logic in their own event handlers; they observe `coachSession` and render.

### 4.1 `PEN_ENTER` — `{ digit: int, fromHint?: bool }`

After the existing `_applyPenEnter` mutation completes (and before the existing emit), the reducer evaluates coach effects:

```js
// pseudocode appended to existing PEN_ENTER handler, BEFORE _emit
if (state.coachSession !== null && !action.fromHint) {
  const session = state.coachSession;
  const filledCell = state.selected;
  const isCoached = session.coachedCells.has(filledCell);
  const techType = session.step.type;

  if (!isCoached) {
    dispatch({ type: 'COACH_END', reason: 'fill-non-coached' });
  } else if (techType === 'elimination') {
    dispatch({ type: 'COACH_END', reason: 'fill-coached-elim' });
  } else {
    // Placement technique — recap fires.
    const correct = state.puzzle.solution[filledCell] === action.digit;
    dispatch({
      type: 'COACH_FILL_RECAP',
      variant: correct ? 'normal' : 'error',
    });
  }
}
```

**Hint-fill case (`action.fromHint === true`):** handled by the `HINT` action separately (§4.3). The `PEN_ENTER` path used by `HINT` skips this block — even though the hint funnels through `_applyPenEnter` indirectly via the `HINT` handler, the `HINT` handler ends the session before the pen mutation, so by the time `PEN_ENTER` runs there is no session to react to. Rather than relying on that ordering, the explicit `!action.fromHint` guard above keeps the cases independent.

**Win precedence (`fspec-002-coach.md` §11.3):** if `_applyPenEnter` chains to `ON_COMPLETION_EVALUATE` and produces `state.won = true`, the win-precedence rule in §4.7 fires `COACH_END { reason: 'won' }`. The recap dispatch above runs *before* the chained `ON_COMPLETION_EVALUATE`, but `COACH_END` from the win path will then collapse the recap. The user sees the win banner instead of the recap. This is the documented behavior.

### 4.2 `ERASE`

After the existing `ERASE` mutation:

```js
if (state.coachSession !== null) {
  dispatch({ type: 'COACH_END', reason: 'erase' });
}
```

This applies whether the erased cell was coached or not. Per `fspec-002-coach.md` §2.2, "erase of any cell ends the session silently."

### 4.3 `PENCIL_TOGGLE`

After the existing `PENCIL_TOGGLE` mutation (which toggles a single bit in `state.pencil[state.selected]`), check whether the user has cleared all elimination targets:

```js
// pseudocode appended to existing PENCIL_TOGGLE handler, AFTER existing mutation
if (state.coachSession !== null
    && state.coachSession.eliminationTargets !== null
    && state.coachSession.recap === null) {
  const targets = state.coachSession.eliminationTargets;
  const allCleared = [...targets.entries()].every(
    ([cellIndex, bits]) => (state.pencil[cellIndex] & bits) === 0
  );
  if (allCleared) {
    dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });
  }
}
```

**Condition:** All three guards must be true before the check runs:
1. A coach session is active.
2. The session is for an elimination technique (`eliminationTargets !== null`).
3. The session is not already in recap (`recap === null`) — no double-dispatch.

**Emit:** `PENCIL_TOGGLE` itself emits `'pencil'`. The inner `COACH_FILL_RECAP` dispatch emits `'coachSession'` (and possibly `'pencil'` per §3.3). No additional emit change is needed in the `PENCIL_TOGGLE` handler.

### 4.5 `HINT`

After the existing `HINT` mutation (which fills a cell via the hint path):

```js
if (state.coachSession !== null) {
  dispatch({ type: 'COACH_END', reason: 'hint' });
}
```

No recap regardless of whether the hinted cell was coached. Per `fspec-002-coach.md` §11.1: "any Hint fill ends the coach session silently."

### 4.6 `NEW_PUZZLE`

The existing `NEW_PUZZLE` handler resets all state. Add to the reset block:

```js
state.coachSession = null;
```

No `COACH_END` dispatch — the reducer is mid-`NEW_PUZZLE` and resetting `coachSession` directly is consistent with how other slices are reset. The pencil revert is irrelevant because `pencil` is also being reset to all-zero. Add `'coachSession'` to the emit's change-set.

### 4.7 `RESET_PUZZLE`

Same treatment as `NEW_PUZZLE`. Add `state.coachSession = null` to the existing reset block; add `'coachSession'` to the emit.

### 4.8 `CHANGE_DIFFICULTY`

Per `fspec-002-coach.md` §11.2, difficulty change ends any active coach session immediately. The existing `CHANGE_DIFFICULTY` handler does not clear puzzle state; the coach session must be cleared explicitly:

```js
if (state.coachSession !== null) {
  dispatch({ type: 'COACH_END', reason: 'puzzle-replaced' });
}
```

The internal dispatch reverts pencil marks via `COACH_END`'s standard path (§3.2), so the user's pencil state is preserved across difficulty changes minus any coach-revealed bits. This is correct: difficulty change does not clear the player's pen entries (§5 in `aspec-game-state.md`), and coach-revealed pencil bits should be reverted just as they would on any other session-end.

### 4.9 `PUZZLE_LOADED`

The existing handler resets all state. Add `state.coachSession = null` to the reset block; add `'coachSession'` to the emit. No revert is needed because `pencil` is being reset to all-zero. The session is implicitly discarded.

This handler runs both for fresh puzzles and for the restore path (`main.js` step 7). On restore, the puzzle is being installed; any previously-saved coach session is discarded by design (`fspec-002-coach.md` §11.7: "session-only … not persisted").

### 4.10 `ON_COMPLETION_EVALUATE`

If the evaluation produces a win and a coach session is active, the win takes precedence:

```js
// Inside ON_COMPLETION_EVALUATE, after the existing win-handling block
if (state.won && state.winHandled && state.coachSession !== null) {
  dispatch({ type: 'COACH_END', reason: 'won' });
}
```

This collapses any in-flight recap as well — if the user filled the last cell and would have triggered a normal recap, the win banner replaces it. The `COACH_END` revert is a no-op for a recap-state session (`coachRevealedBits` is already zero per §3.3), but the slice clears, removing the recap toast.

### 4.11 Existing-action emit-key changes

The following actions add `'coachSession'` to their emit's change-set when (and only when) they end an active session:

| Action | Adds `'coachSession'` to emit? |
|---|---|
| `PEN_ENTER` | Always when a session was active at entry (the inner `dispatch` emits separately, but for clarity the change is also listed in the outer `PEN_ENTER` emit) |
| `ERASE` | Always when a session was active |
| `HINT` | Always when a session was active |
| `PENCIL_TOGGLE` | When the inner `COACH_FILL_RECAP` fires (emitted by that action); `PENCIL_TOGGLE` itself still emits `'pencil'` |
| `NEW_PUZZLE`, `RESET_PUZZLE`, `PUZZLE_LOADED` | Always (the slice is reset to `null` regardless of whether one was active) |
| `CHANGE_DIFFICULTY` | Always when a session was active |
| `ON_COMPLETION_EVALUATE` | Always when a session was active and a win is recorded |

Because the inner `dispatch` to `COACH_END` or `COACH_FILL_RECAP` produces its own `'changed'` emit, subscribers see the change unambiguously. Adding `'coachSession'` to the outer emit is belt-and-suspenders — it lets subscribers that only listen for the outer action type still observe the slice change.

---

## 5. Pencil Snapshot and Revert

Per `fspec-002-coach.md` §2.3 and §6.4, auto-revealed candidates revert when the coach session ends, with one explicit exception: any pencil mark changes the user made *during* the session must persist.

### 5.1 What the snapshot captures

`pencilSnapshot` is a copy of `state.pencil` at the instant `COACH_START` runs, taken *before* any auto-reveal mutation:

```js
const snapshot = new Uint16Array(state.pencil);
```

The 81-element `Uint16Array` mirrors `state.pencil`'s shape exactly (`aspec-game-state.md` §4.2). This is roughly 162 bytes of memory per active session — negligible.

The snapshot is taken before the auto-reveal write because the diff in §5.2 needs to know which bits the coach was responsible for adding.

### 5.2 What `coachRevealedBits` captures

`coachRevealedBits[i]` is the bitset of digits that the coach auto-reveal added to cell `i` — bits that were absent from `pencilSnapshot[i]` and are present in `pencil[i]` immediately after auto-reveal. Computed during `COACH_START` step 2:

```js
coachRevealedBits[i] = (pencilAfterAutoReveal[i]) & ~pencilSnapshot[i];
```

For ranks 1–2 (`autoReveal.required === false`), all entries are zero — no coach reveal happened. The array is constructed at session start and never modified during the session. Auto-reveal is a one-shot: the coach does not add candidates after the session begins.

### 5.3 What the user does during the session

The user is free to switch to Pencil mode and toggle pencil marks during the session (`fspec-002-coach.md` §5.3). Each `PENCIL_TOGGLE` mutates `state.pencil[selected]` directly — it adds or removes a single bit. The reducer does not mirror these changes into `pencilSnapshot` or `coachRevealedBits`; both arrays remain at their session-start values.

If the user toggles off a bit that the coach revealed, that bit is removed from `state.pencil[i]` but remains "set" in `coachRevealedBits[i]`. The revert formula in §5.4 handles this case correctly.

If the user toggles on a bit that the coach did not reveal, that bit is added to `state.pencil[i]` but is not set in `coachRevealedBits[i]`. The revert formula preserves it.

### 5.4 Revert formula

For each cell `i`:

```js
const revealed = coachRevealedBits[i];
if (revealed === 0) continue;                         // nothing to revert in this cell
const snapshot = pencilSnapshot[i];
const current = state.pencil[i];
state.pencil[i] = (snapshot & ~revealed) | (current & ~revealed);
```

**Decomposition:**
- `snapshot & ~revealed` — the bits that were in the pre-coach pencil state, *minus* any bits the coach added. Since `coachRevealedBits` consists of bits not in the snapshot, this is identical to `snapshot` itself. Stating it via the mask documents intent.
- `current & ~revealed` — the bits currently set, minus the bits the coach added. Any user changes (toggle-on of bits not revealed; toggle-off of bits revealed) are preserved.
- Their bitwise-OR is the final restored pencil bits: original snapshot ∪ user changes, with all coach-added bits stripped.

**Worked examples:**

Example A — coach reveals {2, 5} into a cell with snapshot = {3}; user does nothing:
- `snapshot = 0b000010100 (3, 5? no — actually 3 = bit 3 = 0b000000100; let's redo with bit index = digit-1)`
- `snapshot = 0b000000100` (digit 3)
- After auto-reveal: `current = 0b000010110` (digits 2, 3, 5)
- `revealed = current & ~snapshot = 0b000010010` (digits 2, 5)
- User does nothing: `current` stays `0b000010110`.
- Revert: `(0b000000100 & ~0b000010010) | (0b000010110 & ~0b000010010) = 0b000000100 | 0b000000100 = 0b000000100`. Restored to {3}. Correct.

Example B — coach reveals {2, 5}; user toggles 7 on during session:
- snapshot = `0b000000100` (3)
- after auto-reveal: `current = 0b000010110` (2, 3, 5)
- `revealed = 0b000010010` (2, 5)
- user toggles 7 on: `current = 0b001010110` (2, 3, 5, 7)
- Revert: `(0b000000100 & ~0b000010010) | (0b001010110 & ~0b000010010) = 0b000000100 | 0b001000100 = 0b001000100` (3, 7). Correct: snapshot's 3 plus user's 7 are preserved; coach's 2 and 5 are removed.

Example C — coach reveals {2, 5}; user toggles 5 off (a coach-revealed bit) during session:
- snapshot = `0b000000100` (3)
- after auto-reveal: `current = 0b000010110` (2, 3, 5)
- `revealed = 0b000010010` (2, 5)
- user toggles 5 off: `current = 0b000000110` (2, 3)
- Revert: `(0b000000100 & ~0b000010010) | (0b000000110 & ~0b000010010) = 0b000000100 | 0b000000100 = 0b000000100` (3). Correct: the user's "remove 5" was redundant with the revert (coach was going to remove it anyway); the original snapshot is restored cleanly.

Example D — coach does not reveal anything (rank 1–2 session):
- `coachRevealedBits[i] = 0` for all i. The early-`continue` in §3.2's revert loop skips every cell. `state.pencil` is unchanged. Correct.

### 5.5 Why not a simpler `state.pencil = snapshot.slice()`?

Wholesale restore would discard all user pencil changes made during the session (Example B above would lose digit 7). That would violate `fspec-002-coach.md` §2.3's exception. The bit-level diff is required.

### 5.6 Memory and performance

The snapshot and revealed-bits arrays are each 162 bytes. They are allocated fresh on every `COACH_START` and discarded on `COACH_END`. The revert loop is 81 iterations of constant-time bit math. Both are negligible.

---

## 6. Module — `js/ui/coach.js`

`js/ui/coach.js` is a new UI module. It owns no DOM root of its own; instead, it coordinates several DOM nodes that live across multiple containers — the Coach button (inside `#numpad-root`), the explanation panel and recap toast (inside `.left-col`, below `.grid-wrapper`), and the hidden description span (`#sr-coached-desc`, inside `<body>`). The module is responsible for keeping these nodes in sync with `coachSession` and for dispatching coach actions in response to user interaction.

### 6.1 Module contract

```js
// js/ui/coach.js

import { announce } from './srLive.js';
import { analyze } from '../coach/analyzer.js';
import { rowOf, colOf } from '../util/grid.js';

export function mount(root, gameState) → void
```

**`root` argument:** unlike other UI modules which mount inside a single root, `coach.js` is passed `document.body` (or any ancestor that contains all coach-related DOM). The module queries for its specific elements by ID:
- `#btn-coach` — the Coach button (rendered by `numpad.js`)
- `#coach-panel-wrap` — the explanation panel wrapper (in `.left-col`)
- `#coach-recap` — the recap/error toast element (in `.left-col`)
- `#sr-coached-desc` — the hidden screen-reader description span

The module-coupling rule in `aspec-ui.md` §3 ("no direct DOM access outside the module's own root") is relaxed here: `coach.js` reads elements that are DOM-statically-defined in `index.html` (§8) and not owned by any other module's render. The `numpad.js` module renders the button's structure but never re-renders or removes it during a session, so `coach.js` can hold a reference safely. This is documented as the only cross-root access in the UI layer and must not be replicated.

### 6.2 Module-level state

```js
let _gameState = null;
let _btn = null;            // #btn-coach
let _panelWrap = null;      // #coach-panel-wrap
let _recap = null;          // #coach-recap
let _recapTimer = null;              // setTimeout handle for 2.5s recap dismiss
let _errorTimer = null;              // setTimeout handle for 5s error toast dismiss
let _lastSessionHadErrorRecap = false; // set when 'error' recap fires; enables context-aware toast
let _prevSessionRef = null;          // last seen coachSession reference (object identity)
let _prevSelected = null;            // last seen state.selected
```

### 6.3 `RELEVANT_KEYS`

```js
const RELEVANT_KEYS = new Set(['coachSession', 'selected', 'puzzle', 'won']);
```

`'puzzle'` is included so the module can disable/enable the button on puzzle change. `'won'` so the button can disable on win. `'selected'` triggers the focus-tracking flow. `'coachSession'` covers all other lifecycle changes.

### 6.4 Mount sequence

```js
export function mount(root, gameState) {
  _gameState = gameState;
  _btn = document.getElementById('btn-coach');
  _panelWrap = document.getElementById('coach-panel-wrap');
  _recap = document.getElementById('coach-recap');

  _wireButton();

  gameState.on('changed', ({ changed }) => {
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _render(gameState.getState());
    }
  });

  _render(gameState.getState());
}
```

### 6.5 Button click handler

```js
function _wireButton() {
  _btn.addEventListener('mousedown', e => e.preventDefault());  // numpad pattern
  _btn.addEventListener('click', _onCoachPressed);
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName ?? '';
    if ((e.key === 'c' || e.key === 'C') &&
        !['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) {
      e.preventDefault();
      _onCoachPressed();
    }
  });
}

function _onCoachPressed() {
  const state = _gameState.getState();
  if (!state.puzzle || state.won) return;

  // If a session is active or an error toast is showing, reset first.
  if (state.coachSession !== null) {
    _gameState.dispatch({ type: 'COACH_END', reason: 'session-reset' });
  }
  if (_errorTimer !== null) {
    clearTimeout(_errorTimer);
    _errorTimer = null;
    _hideRecap();
  }

  const result = analyze(
    state.puzzle,
    { pen: state.pen, conflicts: state.conflicts, pencil: state.pencil }
  );

  if (result.type === 'no-technique') {
    _gameState.dispatch({ type: 'COACH_NO_TECHNIQUE', reason: result.reason });
    _showErrorToast(result.reason);
    return;
  }

  _gameState.dispatch({ type: 'COACH_START', result });

  // Live-region announcement (vspec §12.2)
  const n = deriveCoachedCells(result).size;
  announce(`Coach: ${result.technique} identified. ${n} cells highlighted.`);
}
```

### 6.6 `COACH_END`-then-`COACH_START` ordering

Pressing Coach during an active session must reset the previous session before running fresh analysis. The reducer does support a `COACH_START` from an active session as a defensive fallback (§3.1), but `coach.js` is contractually required to dispatch `COACH_END` first so the change-event ordering is clean — observers see the session disappear, then a new session appear, in two distinct events rather than one.

The `COACH_END`-first ordering also matters for the analyzer input: `analyze()` consumes `state.pen` and `state.conflicts`, both of which are unaffected by coach session lifecycle. But it is conceptually cleaner for the analyzer to see the post-revert state. (In practice, the revert only mutates `pencil`, which the analyzer ignores per the analyzer spec §4.1, so the result is identical either way. The ordering is a clarity convention.)

### 6.7 Render — Coach button

```js
function _render(state) {
  _renderButton(state);
  _renderPanel(state);
  _renderRecap(state);
  _trackFocus(state);
}

function _renderButton(state) {
  if (!_btn) return;
  const active = state.coachSession !== null && state.coachSession.recap === null;
  _btn.disabled = !state.puzzle || state.won;

  if (active) {
    _btn.classList.add('coaching');
    _btn.setAttribute('aria-label', 'Coach (active)');
  } else {
    _btn.classList.remove('coaching');
    _btn.setAttribute('aria-label', 'Coach');
  }
}
```

The button is `'coaching'` only while highlights are active. During a recap (`coachSession.recap !== null`), the button reverts to idle visual state — the recap is showing the result; the user can press Coach again for a new analysis.

### 6.8 Render — Explanation panel

```js
function _renderPanel(state) {
  const session = state.coachSession;
  const focused = session && session.focusedCoachedCell !== null;

  if (focused) {
    _renderPanelContent(session.step);
    _panelWrap.classList.add('open');
    // Tell the overlay to show
    _panelWrap.dispatchEvent(new CustomEvent('coach:panel-opened', {
      bubbles: true, detail: { step: session.step },
    }));
  } else {
    _panelWrap.classList.remove('open');
    _panelWrap.dispatchEvent(new CustomEvent('coach:panel-closed', { bubbles: true }));
  }
}
```

The panel-open/close is signalled to `coachOverlay.js` via a `CustomEvent` on `_panelWrap` (which bubbles up to `document`, where `coachOverlay.js` listens). This keeps the two modules decoupled — `coachOverlay.js` does not need a reference to `coach.js` or to its module-private state. See §7.4.

### 6.9 Panel content rendering

`_renderPanelContent(step)` rebuilds the inner DOM of `#coach-panel-wrap`:

```html
<div id="coach-panel-wrap" class="coach-panel-wrap">
  <div class="coach-panel" role="region" aria-label="Coach explanation">
    <div class="coach-panel-technique">{step.technique}</div>
    <p class="coach-panel-text">{rendered supportingText}</p>
    {if step.complexity.acknowledged:
      <p class="coach-panel-text coach-panel-note">{step.complexity.note}</p>
    }
  </div>
</div>
```

The wrapper element `#coach-panel-wrap` is static in `index.html` (§8). The inner `.coach-panel` is rebuilt on every panel-open. (Frequency is bounded — at most once per focus-change to a coached cell.)

#### 6.9.1 `*…*` emphasis parsing

`step.supportingText` may contain `*single-asterisk*` runs marking emphasis. Convert to `<em>` per `vspec-002-coach.md` §7.4:

```js
function _renderSupportingText(text) {
  // Split on '*'; even-indexed segments are plain, odd-indexed are emphasis.
  const parts = text.split('*');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      frag.appendChild(document.createTextNode(parts[i]));
    } else {
      const em = document.createElement('em');
      em.textContent = parts[i];
      frag.appendChild(em);
    }
  }
  return frag;
}
```

This is intentionally simple. No markdown library, no escape handling — `supportingText` is constructed by the analyzer from a fixed set of templates with sanitized interpolations (digits, row/column/box labels). Asterisks in interpolated values are not possible (digits are 1–9, unit names are `'row' | 'col' | 'box'`).

### 6.10 Render — Recap and error toast

```js
function _renderRecap(state) {
  const session = state.coachSession;

  // Reducer-driven recap (placement-fill outcome).
  if (session && session.recap !== null) {
    const variant = session.recap;
    _showRecap(session.step, variant);
    if (_recapTimer === null) {
      _recapTimer = setTimeout(() => {
        _recapTimer = null;
        _gameState.dispatch({ type: 'COACH_END', reason: 'recap-timeout' });
      }, 2500);
    }
    return;
  }

  // No reducer recap → ensure recap element is hidden unless an error
  // toast is currently being shown by _showErrorToast.
  if (_recapTimer !== null) {
    clearTimeout(_recapTimer);
    _recapTimer = null;
  }
  if (_errorTimer === null) {
    _hideRecap();
  }
}
```

The error toast does not flow through `coachSession.recap`; it is `coach.js`-internal:

```js
function _showErrorToast(reason) {
  const useContextMessage = reason === 'error' && _lastSessionHadErrorRecap;
  _lastSessionHadErrorRecap = false;

  const text = reason === 'complete'
    ? 'The puzzle is already solved.'
    : useContextMessage
      ? 'That suggestion didn\'t work out. A mistaken pencil erasure elsewhere on the board may have led the coach astray. Try using Erase All Pencil and asking the coach again.'
      : reason === 'error'
        ? 'The board has an error. Use Check or Erase to fix it before coaching.'
        : 'The board has a contradiction. Use Erase to fix it.';

  _recap.classList.add('error', 'visible');
  _recap.innerHTML = `
    <div class="coach-recap-line1">${text}</div>
    <div class="coach-recap-line2"></div>
  `;
  announce(`Coach: ${text}`);

  _errorTimer = setTimeout(() => {
    _errorTimer = null;
    _hideRecap();
  }, 5000);
}
```

The recap and error toast share `#coach-recap` (vspec §10). `_showRecap` and `_showErrorToast` set the same element's classes and innerHTML; `_hideRecap` removes `.visible` (and `.error`) from the element.

```js
function _showRecap(step, variant) {
  _recap.classList.add('visible');
  _recap.classList.toggle('error', variant === 'error');

  const techName = step.technique;
  const detailSentence = _composeRecapDetail(step);  // §6.11

  if (variant === 'elim') {
    const detail = _composeElimRecapDetail(step);
    _recap.innerHTML = `
      <div class="coach-recap-line1">Candidates eliminated.</div>
      <div class="coach-recap-line2">${detail}</div>
    `;
    announce(`Candidates eliminated. ${detail}`);
    return;
  }

  if (variant === 'normal') {
    _recap.innerHTML = `
      <div class="coach-recap-line1">You used ${techName}.</div>
      <div class="coach-recap-line2">${detailSentence}</div>
    `;
    announce(`You used ${techName}. ${detailSentence}`);
  } else {
    _recap.innerHTML = `
      <div class="coach-recap-line1">That's not the right digit — the ${techName} suggestion still stands.</div>
      <div class="coach-recap-line2">Press Coach to try again.</div>
    `;
    announce(`That's not the right digit — ${techName} suggestion still stands. Press Coach to try again.`);
  }
}

function _composeElimRecapDetail(step) {
  const D = step.digits[0];  // primary digit being eliminated
  // Use roles.elimTarget when non-empty (most techniques). Fall back to
  // counting distinct cells in step.eliminations for Hidden Pair / Hidden
  // Triple, which set roles.elimTarget = [].
  const n = step.roles.elimTarget.length > 0
    ? step.roles.elimTarget.length
    : new Set(step.eliminations.map(e => e.cellIndex)).size;
  const unitLabel = step.unit ? _formatUnitLabel(step.unit) : 'the grid';
  return `${step.technique} in ${unitLabel}: digit ${D} removed from ${n} cell${n === 1 ? '' : 's'}.`;
}

function _hideRecap() {
  _recap.classList.remove('visible', 'error');
  _recap.innerHTML = '';
}
```

### 6.11 Recap detail-sentence composition

For placement techniques, the detail sentence (`coach-recap-line2`) follows the patterns in `fspec-002-coach.md` §9.2:

- Naked Single: `"Naked Single in row R, column C: only D could go here."`
- Hidden Single: `"Hidden Single in the [unit-type] at [unit-label]: D was the only position for that digit."`

`unit-label` formatting:
- For `unit.type === 'row'`: `"row " + (unit.index + 1)`
- For `unit.type === 'col'`: `"column " + (unit.index + 1)`
- For `unit.type === 'box'`: `"box " + (unit.index + 1)` (or `"the top-left box"`-style if a friendlier label is desired; the spec authorizes `"box N"` as the canonical form)

The composition is a `coach.js` concern, not an analyzer concern. The analyzer provides `step.unit` and `step.digits[0]`; the row/col of the target is `rowOf(step.roles.target) + 1`, `colOf(step.roles.target) + 1`. Implementation:

```js
function _composeRecapDetail(step) {
  const D = step.digits[0];
  if (step.technique === 'Naked Single') {
    const r = rowOf(step.roles.target) + 1;
    const c = colOf(step.roles.target) + 1;
    return `Naked Single in row ${r}, column ${c}: only ${D} could go here.`;
  }
  if (step.technique === 'Hidden Single') {
    const u = step.unit;
    const label = _formatUnitLabel(u);
    return `Hidden Single in ${label}: ${D} was the only position for that digit.`;
  }
  return '';  // elimination techniques never produce a recap (see §4.1)
}

function _formatUnitLabel(u) {
  if (u.type === 'row') return `row ${u.index + 1}`;
  if (u.type === 'col') return `column ${u.index + 1}`;
  return `box ${u.index + 1}`;
}
```

### 6.12 Focus tracking

`coach.js` observes `state.selected` change events and translates them into `COACH_FOCUS_COACHED_CELL` / `COACH_FOCUS_OFF` dispatches:

```js
function _trackFocus(state) {
  const session = state.coachSession;
  if (!session) {
    _prevSelected = state.selected;
    return;
  }

  const sel = state.selected;
  const isCoached = sel !== null && session.coachedCells.has(sel);
  const wasCoached = session.focusedCoachedCell !== null;

  if (isCoached && session.focusedCoachedCell !== sel) {
    _gameState.dispatch({ type: 'COACH_FOCUS_COACHED_CELL', index: sel });
  } else if (!isCoached && wasCoached) {
    _gameState.dispatch({ type: 'COACH_FOCUS_OFF' });
  }

  _prevSelected = sel;
}
```

The dispatch only fires when the focus state changes — re-renders that don't move focus do not re-dispatch. The reducer guards against no-op dispatches (§3.4, §3.5) defensively.

### 6.13 Coached-cell ARIA wiring

The `aria-describedby` attribute on coached cells points to `#sr-coached-desc`. Because `grid.js` owns the cell DOM and re-renders cells on relevant changes, the simplest approach is to have `grid.js` apply the attribute as part of its render path. To do that, `grid.js` must read `state.coachSession.coachedCells` during cell render. The minimum change to `grid.js` is documented in §12.3.

`coach.js` does not directly mutate cell ARIA. Its only ARIA writes are:
- `#btn-coach` `aria-label` (§6.7)
- (No ARIA writes on the panel — the panel's `role="region"` and `aria-label="Coach explanation"` are static in the rendered panel HTML, set by `_renderPanelContent`)

### 6.14 Live-region announcements

`coach.js` calls `srLive.announce()` for the events listed in vspec §12.2:

| Trigger in `coach.js` | Announcement |
|---|---|
| After `COACH_START` dispatch (technique found) | `"Coach: ${technique} identified. ${N} cells highlighted."` |
| After `COACH_NO_TECHNIQUE` dispatch (`'complete'`) | `"Coach: The puzzle is already solved."` |
| After `COACH_NO_TECHNIQUE` dispatch (`'error'`) | `"Coach: The board has an error. Use Check or Erase to fix it before coaching."` |
| After `COACH_NO_TECHNIQUE` dispatch (`'inconsistent'`) | `"Coach: The board has a contradiction. Use Erase to fix it."` |
| In `_trackFocus`, on `COACH_FOCUS_COACHED_CELL` dispatch | `"Coached cell. ${technique}. ${supporting text plain}."` |
| In `_showRecap`, normal variant | `"You used ${technique}. ${detail}"` |
| In `_showRecap`, error variant | `"That's not the right digit — ${technique} suggestion still stands. Press Coach to try again."` |

The "supporting text plain" form strips the `*…*` emphasis markers (the announcement does not narrate emphasis):

```js
function _stripEmphasis(text) {
  return text.replace(/\*/g, '');
}
```

### 6.15 `prevSessionRef` and re-render economy

The module's relevant-keys set fires on every `'coachSession'` change, which includes pure focus changes (`COACH_FOCUS_COACHED_CELL`). To avoid rebuilding the panel HTML on every focus tick within the same session, `_renderPanelContent` checks whether the `step` reference is unchanged from the previous render:

```js
let _renderedStep = null;
function _renderPanelContent(step) {
  if (step === _renderedStep) return;  // same session — already rendered
  _renderedStep = step;
  // ... rebuild panel innerHTML ...
}
```

The `step` reference is replaced exactly when a new `COACH_START` runs (the reducer assigns a new slice object), so this short-circuit is correct.

---

## 7. Module — `js/ui/coachOverlay.js`

`js/ui/coachOverlay.js` owns the `#coach-overlay` SVG element and translates `step.arrows` into SVG primitives.

### 7.1 Module contract

```js
// js/ui/coachOverlay.js

export function mount(root, gameState) → void
```

`root` is `document.body` (the same as for `coach.js`). The module queries `#coach-overlay` directly — like `coach.js`, this module is one of two UI modules with cross-root DOM access, by design.

### 7.2 Module-level state

```js
let _gameState = null;
let _overlay = null;        // #coach-overlay
let _renderedStep = null;
```

### 7.3 Mount

```js
export function mount(root, gameState) {
  _gameState = gameState;
  _overlay = document.getElementById('coach-overlay');

  // Listen for panel open/close events from coach.js
  document.addEventListener('coach:panel-opened', (e) => {
    _showOverlay(e.detail.step);
  });
  document.addEventListener('coach:panel-closed', () => {
    _hideOverlay();
  });

  // Hide on any session end (coachSession transitions to null) — covers the
  // case where the panel never opened but the session ends.
  gameState.on('changed', ({ changed }) => {
    if (!changed.has('coachSession')) return;
    if (gameState.getState().coachSession === null) _hideOverlay();
  });
}
```

### 7.4 Synchronization with the panel lifecycle

Per `vspec-002-coach.md` §6, the overlay is visible only while the explanation panel is open. The two are coupled:

- Panel opens (`coach:panel-opened` fires) → overlay re-renders for the current step and adds `.visible`.
- Panel closes (`coach:panel-closed` fires) → overlay clears its inner SVG and removes `.visible`.
- Session ends without the panel ever opening (e.g., user presses Coach with no coached cell focused) → overlay stays hidden; the `'changed'` listener removes `.visible` defensively.

The `coach:panel-opened` event carries `detail.step` so `coachOverlay.js` does not need to call `gameState.getState()` to read the step. This avoids a re-render race where the panel opens before the overlay's listener has processed the latest state change. (The panel and the overlay listen for different events, so without the explicit `step` payload, an order-dependence would creep in.)

### 7.5 SVG construction

`#coach-overlay` is defined statically in `index.html` (§8) with the following base structure:

```html
<svg id="coach-overlay" width="414" height="414" viewBox="0 0 414 414" aria-hidden="true">
  <defs>
    <marker id="coach-arrowhead" markerWidth="6" markerHeight="4"
            refX="5" refY="2" orient="auto">
      <polygon points="0 0, 6 2, 0 4" fill="currentColor" opacity="0.7" />
    </marker>
  </defs>
  <g id="coach-overlay-content"></g>
</svg>
```

The marker is defined once and reused via `marker-end` references on lines and paths.

`_showOverlay(step)` clears `#coach-overlay-content` and appends one element per `Arrow` in `step.arrows`:

```js
function _showOverlay(step) {
  if (step === _renderedStep) {
    _overlay.classList.add('visible');
    return;  // already rendered; just show
  }
  _renderedStep = step;

  const content = _overlay.querySelector('#coach-overlay-content');
  content.innerHTML = '';

  for (const arrow of step.arrows) {
    const el = _renderArrow(arrow);
    if (el) content.appendChild(el);
  }

  _overlay.classList.add('visible');
}

function _hideOverlay() {
  _overlay.classList.remove('visible');
  _renderedStep = null;
}
```

### 7.6 Cell-center coordinate computation

The grid is 414×414 px; each cell is 414/9 = 46 px square; the center of cell index `i` is:

```js
function _cellCenter(i) {
  const row = Math.floor(i / 9);
  const col = i % 9;
  return { x: col * 46 + 23, y: row * 46 + 23 };
}
```

**Coordinate assumption:** these constants are in SVG viewBox units (`viewBox="0 0 414 414"`), not CSS pixels. The overlay SVG scales to match the grid at every viewport size via responsive CSS rules that mirror the `.sudoku-grid` breakpoints; the viewBox mapping handles the coordinate scaling automatically, so JS constants never need to change for responsive shrinking. The constants would only need updating if the base grid size (414 px) changed.

### 7.7 Arrow rendering by style

Each `Arrow` style maps to a specific SVG element:

#### 7.7.1 `straight-arrow`

```js
case 'straight-arrow': {
  const a = _cellCenter(arrow.from);
  const b = _cellCenter(arrow.to);
  const { x: x1, y: y1, x: x2, y: y2 } = _shortenLine(a, b, 16, 20);
  // 16 px back from peer center, 20 px short of target center
  return _line(x1, y1, x2, y2, {
    stroke: 'currentColor', strokeOpacity: 0.6, strokeWidth: 1.5,
    markerEnd: 'url(#coach-arrowhead)',
  });
}
```

#### 7.7.2 `dashed-arrow`

```js
case 'dashed-arrow': {
  const a = _cellCenter(arrow.from);
  const b = _cellCenter(arrow.to);
  const { x: x1, y: y1, x: x2, y: y2 } = _shortenLine(a, b, 18, 18);
  return _line(x1, y1, x2, y2, {
    stroke: 'currentColor', strokeOpacity: 0.5, strokeWidth: 1.5,
    strokeDasharray: '4 3',
    markerEnd: 'url(#coach-arrowhead)',
  });
}
```

#### 7.7.3 `bezier-arc`

```js
case 'bezier-arc': {
  const a = _cellCenter(arrow.from);
  const b = _cellCenter(arrow.to);
  const offY = arrow.controlOffsetY ?? -18;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2 + offY;     // offY negative = above midpoint
  const { startX, startY, endX, endY } = _shortenAlongCurve(a, b, cx, cy, 18, 18);
  const d = `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;
  return _path(d, {
    stroke: 'currentColor', strokeOpacity: 0.8, strokeWidth: 2, fill: 'none',
    markerEnd: 'url(#coach-arrowhead)',
  });
}
```

`_shortenAlongCurve` approximates the start/end clearance by stepping a small distance along the tangent at each endpoint. For the purposes of this spec, a linear approximation toward the control point suffices (visually the offset is small relative to the arc length).

#### 7.7.4 `connector-chain`

```js
case 'connector-chain': {
  const points = arrow.points.map(_cellCenter)
    .map(p => `${p.x},${p.y}`).join(' ');
  // Closed polyline — repeat first point at end
  const first = arrow.points[0];
  const firstC = _cellCenter(first);
  const closed = `${points} ${firstC.x},${firstC.y}`;
  return _polyline(closed, {
    stroke: 'currentColor', strokeOpacity: 0.5, strokeWidth: 1.5, fill: 'none',
  });
}
```

The polyline has no arrowhead — `connector-chain` is an outline, not a directional arrow.

#### 7.7.5 `chain-edge`

```js
case 'chain-edge': {
  const a = _cellCenter(arrow.from);
  const b = _cellCenter(arrow.to);
  const { x: x1, y: y1, x: x2, y: y2 } = _shortenLine(a, b, 16, 16);
  const strong = arrow.strong === true;
  return _line(x1, y1, x2, y2, {
    stroke: 'currentColor',
    strokeOpacity: strong ? 0.7 : 0.5,
    strokeWidth: strong ? 2 : 1.5,
    strokeDasharray: strong ? null : '4 3',
    // No marker — chain edges do not have arrowheads
  });
}
```

#### 7.7.6 `elim-line`

Used by Hidden Single. A straight line from the cause cell center to the far boundary of
the eliminated cell — the line passes through the eliminated cell and terminates at its
exit edge rather than stopping short of it.

```js
case 'elim-line': {
  const a = _cellCenter(arrow.from);
  const end = _cellFarBoundary(arrow.from, arrow.to);
  return _line(a.x, a.y, end.x, end.y, {
    stroke: 'currentColor', strokeOpacity: 0.45, strokeWidth: 1.5,
  });
}
```

`_cellFarBoundary(from, to)` computes where the straight ray from `_cellCenter(from)`
exits the boundary of cell `to` on the far side (the side away from `from`).

### 7.8 SVG element factories

```js
const SVG_NS = 'http://www.w3.org/2000/svg';

function _line(x1, y1, x2, y2, attrs) {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', x1); el.setAttribute('y1', y1);
  el.setAttribute('x2', x2); el.setAttribute('y2', y2);
  _applyAttrs(el, attrs);
  return el;
}

function _path(d, attrs) {
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', d);
  _applyAttrs(el, attrs);
  return el;
}

function _polyline(points, attrs) {
  const el = document.createElementNS(SVG_NS, 'polyline');
  el.setAttribute('points', points);
  _applyAttrs(el, attrs);
  return el;
}

function _applyAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    const dashed = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    el.setAttribute(dashed, v);
  }
}
```

### 7.9 Why a `CustomEvent` and not direct state observation?

`coachOverlay.js` could read `coachSession.focusedCoachedCell` from `getState()` to decide whether to show. Using `CustomEvent` bridges this differently for two reasons:
1. The overlay is purely a panel-companion. It has no behavior independent of the panel. Tying it to the panel's lifecycle directly avoids drift.
2. The `CustomEvent` carries the `step` payload, eliminating a `getState()` round-trip in the listener (and the associated risk of reading a stale state during a render-batch).

This is a deliberate departure from the "observe state, render" pattern used elsewhere in the UI layer. It is justified because the overlay is a sub-feature of the panel, not an independent UI concern.

---

## 8. `index.html` Additions

The Implementor adds the following DOM nodes to `index.html`. Insertion points are noted relative to the existing structure (read from the file as it stands today).

### 8.1 Inside `<body>`, alongside `#sr-live` (above `<header>`)

```html
<!-- Hidden coach-cell description (referenced via aria-describedby on coached cells) -->
<span id="sr-coached-desc" class="visually-hidden">Coached cell — focus for explanation.</span>
```

A `.visually-hidden` utility class (per common a11y pattern) is added to `base.css`. If one already exists in `base.css` for the existing `#sr-live`-style hiding, reuse it; otherwise add it.

### 8.2 Inside `.left-col`, between `<div class="grid-wrapper">` and `</div><!-- /left-col -->`

```html
<!-- Coach overlay (SVG arrows). Sits absolutely on top of the grid; mounted by coachOverlay.js. -->
<svg id="coach-overlay" width="414" height="414" viewBox="0 0 414 414" aria-hidden="true">
  <defs>
    <marker id="coach-arrowhead" markerWidth="6" markerHeight="4"
            refX="5" refY="2" orient="auto">
      <polygon points="0 0, 6 2, 0 4" fill="currentColor" opacity="0.7" />
    </marker>
  </defs>
  <g id="coach-overlay-content"></g>
</svg>

<!-- Coach explanation panel (mounted by coach.js). -->
<div id="coach-panel-wrap" class="coach-panel-wrap"></div>

<!-- Coach recap / error toast (mounted by coach.js). -->
<div id="coach-recap" class="coach-recap" role="status" aria-live="polite"></div>
```

**Positioning:**
- `#coach-overlay` is positioned absolutely *over* the grid via CSS (§11). It is a sibling of `.grid-wrapper`, but `position: absolute` with a containing-block on `.grid-wrapper` (or a wrapper `<div>` with `position: relative`) lets it overlay the grid. The Implementor decides whether to nest the SVG inside `.grid-wrapper` for the simpler containing-block resolution; if so, place it as the last child of `.grid-wrapper`, after `#grid-root`. Either placement is acceptable as long as the SVG sits above the cells (`z-index: 5`) and below the win banner (`z-index: 10`).
- `#coach-panel-wrap` and `#coach-recap` are siblings of `.grid-wrapper`, in flow, sized at 414 px wide.

### 8.3 Numpad button restructuring

The Coach button is rendered by `numpad.js` as part of its template, not as static HTML. See §10 for the exact template change.

### 8.4 No changes elsewhere

`#dialog-root`, the action row, `#stats-root`, the theme select, and the header are unchanged.

---

## 9. `main.js` Bootstrap Changes

### 9.1 Mount-order placement

`aspec-game-state.md` §1.2 step 8 lists the mount order:

> 8. Mount UI modules in order: `srLive`, `themes`, `controls`, `grid`, `numpad`, `stats`, `winBanner`, `dialog`, `keyboard`.

Insert `coach` and `coachOverlay` into this list. The new step 8 reads:

> 8. Mount UI modules in order: `srLive`, `themes`, `controls`, `grid`, `numpad`, `coach`, `coachOverlay`, `stats`, `winBanner`, `dialog`, `keyboard`.

**Why after `numpad`:** `coach.js` queries for `#btn-coach`, which is created by `numpad.js`'s render. `numpad` must mount first.

**Why after `grid`:** `coach.js` does not directly query grid cells, but the focus-tracking flow (§6.12) reads `state.selected`, which `grid.js` is responsible for setting. Mounting `grid` first ensures the grid's event listeners are active when `coach.js` first dispatches focus events.

**Why before `winBanner`:** the win banner subscribes to `state.won`. If a coach session is active when a win fires, the reducer dispatches `COACH_END` (§4.8). `coach.js` should be mounted in time to observe that end and clear the recap/error toast before the win banner appears. Practically, mount order matters less here than logical correctness — both modules see the same `'changed'` event — but placing coach first matches the dependency chain.

**Why `coachOverlay` immediately after `coach`:** `coachOverlay.js` listens for `coach:panel-opened` events that `coach.js` dispatches. The events bubble up to `document`, where `coachOverlay.js` listens. Mounting in order ensures the listener is in place before any panel-open could fire, even though no panel can open during the bootstrap (no puzzle is loaded yet).

### 9.2 Imports and mount calls

Append to the import block in `main.js`:

```js
import { mount as mountCoach } from './ui/coach.js';
import { mount as mountCoachOverlay } from './ui/coachOverlay.js';
```

Insert after the `mountNumpad` call:

```js
mountCoach(document.body, gameState);
mountCoachOverlay(document.body, gameState);
```

### 9.3 Persistence subscriber unchanged

The persistence subscriber (`main.js` step 9, currently `PERSIST_KEYS = new Set(['puzzle', 'pen', 'pencil', 'hintsRemaining', 'attemptRecorded'])`) does not need to be modified. `coachSession` is intentionally not in `PERSIST_KEYS` because:
- Per `fspec-002-coach.md` §11.7, the session is not persisted.
- Auto-revealed pencil bits *do* affect `pencil`, which is persisted. The persistence subscriber will fire on `'pencil'` change events generated by `COACH_START` and `COACH_END`. This is acceptable: if the user reloads the page mid-session, the persisted `pencil` blob may include coach-revealed bits. On restore, those bits become "real" pencil marks (the session is gone, so there's nothing to revert against).

This is a deliberate trade-off, called out in §15.3 as a known minor edge case. The alternative — suppressing `pencil` writes during a coach session — would require the persistence subscriber to read `coachSession` and is more coupling than the edge case warrants.

---

## 10. Numpad Layout Restructuring

Per `vspec-002-coach.md` §2, the existing single-row `.numpad-bottom` (Hint + Check, where Check spans 2 columns) is replaced by two separate rows.

### 10.1 HTML template change in `numpad.js`

The existing `_buildNumpad()` template's `.numpad-bottom` block:

```html
<div class="numpad-bottom">
  <button class="btn btn-hint" id="btn-hint" aria-label="Hint">
    Hint <span class="hint-badge" id="hint-count">0</span>
  </button>
  <button class="btn btn-check" id="btn-check" aria-label="Check answers">Check</button>
</div>
```

becomes:

```html
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

### 10.2 `numpad.js` event-handler changes

The existing `numpad.js` handlers for `#btn-hint` and `#btn-check` remain unchanged.

The new `#btn-coach` button is **not** wired by `numpad.js`. `coach.js` finds it by ID and attaches its own click and `mousedown` handlers (§6.5). The mousedown handler is identical in pattern to the existing toolbar focus-pattern (`numpad.js` already prevents pointer-driven focus transfer for all numpad buttons via the `mousedown: e => e.preventDefault()` loop, but only for buttons that exist when that loop runs — which is at numpad mount time).

**Issue:** the toolbar focus pattern in `numpad.js` (currently `_root.querySelectorAll('button').forEach(...)`) runs at numpad mount and loops over *all* buttons inside `#numpad-root`. Since `#btn-coach` is rendered by `numpad.js`'s template, it is included in the loop. The `mousedown` preventDefault is therefore applied automatically by `numpad.js`. `coach.js` does not need to add its own mousedown handler.

**Resolution:** `coach.js` only attaches a `click` listener. The `mousedown: e => e.preventDefault()` is handled by the existing `numpad.js` loop. (§6.5's pseudocode includes a `mousedown` registration; on review, this is redundant with `numpad.js`'s loop. The Implementor may omit it. The spec lists it for clarity but considers it optional.)

### 10.3 `numpad.js` state observance

`numpad.js` does not need to observe `coachSession`. It does not enable/disable the Coach button based on coach state — the button remains enabled whenever a puzzle is loaded and not won. The button-state logic in `numpad.js` already includes `puzzle` and `won` in `RELEVANT_KEYS`; the Coach button's `disabled` attribute is managed by `coach.js`'s `_renderButton`, which observes the same keys.

To avoid duplicate work, `numpad.js`'s `_update` does not touch `#btn-coach` at all. `coach.js` is the sole renderer of the Coach button's classes and ARIA attributes.

### 10.4 CSS layout — see §11.2

---

## 11. CSS Additions

### 11.1 Per-theme coach custom properties — added to `css/themes.css`

The three coach variables are defined inside each theme block (not at a shared `:root`). Per `vspec-002-coach.md` §1:

```css
:root,
body.theme-minimalist {
  /* ... existing theme vars ... */
  --coach:         #7c3aed;
  --coach-light:   #ede9fe;
  --coach-mid:     #c4b5fd;
}

body.theme-coffee {
  /* ... existing theme vars ... */
  --coach:         #c2410c;
  --coach-light:   #ffedd5;
  --coach-mid:     #fb923c;
}

body.theme-school {
  /* ... existing theme vars ... */
  --coach:         #1d4ed8;
  --coach-light:   #dbeafe;
  --coach-mid:     #93c5fd;
}

body.theme-mountain {
  /* ... existing theme vars ... */
  --coach:         #0f766e;
  --coach-light:   #ccfbf1;
  --coach-mid:     #5eead4;
}

body.theme-terminal {
  /* ... existing theme vars ... */
  --coach:         #0e7490;
  --coach-mid:     #155e75;
  --coach-light:   #0a1f28;
}
```

### 11.2 Numpad layout — added to `css/controls.css`

Replace the existing `.numpad-bottom` rule with:

```css
.numpad-bottom-row1 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.numpad-bottom-row2 {
  width: 100%;
}

.numpad-bottom-row2 .btn-check {
  width: 100%;
}
```

Remove the existing `.btn-check { grid-column: span 2; }` rule, as the new layout no longer uses grid spans for Check.

The `.numpad` flex container's `gap: 8px` (already in `controls.css` line 5) provides the inter-row spacing per vspec §2.1.

### 11.3 Coach button — added to `css/controls.css`

```css
.btn-coach {
  /* No additional rules — inherits .btn appearance in idle state */
}

.btn-coach.coaching {
  background: var(--coach-light);
  border-color: var(--coach);
  color: var(--coach);
  font-weight: 600;
  box-shadow: 0 0 0 2px var(--coach-light), 0 0 0 3px var(--coach);
  animation: coach-pulse 2s ease-in-out infinite;
}

@keyframes coach-pulse {
  0%, 100% { box-shadow: 0 0 0 2px var(--coach-light), 0 0 0 3px var(--coach); }
  50%      { box-shadow: 0 0 0 4px var(--coach-light), 0 0 0 5px var(--coach-mid); }
}

/* Terminal theme override: no border-radius, uppercase, smaller font.
   This is already covered by the generic body.theme-terminal .btn rule, so
   no separate rule is needed for .btn-coach in Terminal. */
```

Verify after implementation that the Terminal-theme `.btn` override is sufficient for `.btn-coach.coaching` — the box-shadow ring should still render correctly on Terminal's dark background.

### 11.4 Cell-state classes — added to `css/grid.css`

Per `vspec-002-coach.md` §4. Solid-ring coach classes use `box-shadow: inset` so the selection `outline` (which CSS paints last) remains visible on top when a coached cell is also selected. Dashed-ring classes must keep `outline` (box-shadow has no dashed mode) and instead use an explicit `.selected` override to show the accent ring.

```css
.cell.coached-cause {
  background: var(--coach-light) !important;
  box-shadow: inset 0 0 0 2px var(--coach-mid);
  z-index: 2;
}

.cell.coached-target {
  background: var(--coach-light) !important;
  box-shadow: inset 0 0 0 2px var(--coach);
  z-index: 2;
}

.cell.coached-elim-target {
  outline: 2px dashed var(--coach);
  outline-offset: -2px;
  z-index: 2;
  /* No background override */
}

/* Dashed-ring classes can't use box-shadow, so show the accent ring explicitly on selection */
.cell.coached-elim-target.selected,
.cell.coached-sc-b.selected {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cell.coached-unit-member {
  background: var(--coach-light) !important;
  /* No outline override */
}

.cell.coached-sc-a {
  background: var(--coach) !important;
  color: #ffffff;
  box-shadow: inset 0 0 0 2px var(--coach);
  z-index: 2;
}

.cell.coached-sc-b {
  background: var(--coach-light) !important;
  outline: 2.5px dashed var(--coach);
  outline-offset: -2px;
  z-index: 2;
}

/* Focus ring overrides — coached cells use the coach accent color */
.cell.coached-target:not(.selected):focus-visible,
.cell.coached-cause:not(.selected):focus-visible {
  outline-color: var(--coach);
}
```

The `!important` on `background` is required because the existing selection (`.cell.selected`), conflict (`.cell.conflict`), and incorrect (`.cell.incorrect`) classes also set `background`. Without `!important`, the cascade order would not guarantee coach-class precedence.

### 11.5 Auto-revealed pencil marks — added to `css/grid.css`

```css
.pencil-mark.coach-reveal {
  color: var(--coach);
  font-weight: 700;
}
```

User pencil marks remain `color: var(--pencil); font-weight: 500;` as defined in v1.

### 11.6 SVG overlay — added to `css/grid.css`

```css
#coach-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 414px;
  height: 414px;
  pointer-events: none;
  z-index: 5;
  display: none;
  color: var(--coach);
}

#coach-overlay.visible {
  display: block;
}
```

This rule assumes `#coach-overlay` is positioned within a containing block whose top-left aligns with the grid's top-left. If the SVG is placed inside `.grid-wrapper`, that container must have `position: relative`. If placed outside, an explicit `position: absolute` containing-block wrapper is needed. The Implementor may add `position: relative` to `.grid-wrapper` if not already present.

### 11.7 Explanation panel — added to `css/controls.css`

```css
.coach-panel-wrap {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.15s ease-out;
}

.coach-panel-wrap.open {
  max-height: 220px;
}

/* No close transition — when .open is removed, max-height collapses to 0
   instantly. CSS does not animate on .open removal because the transition
   is only declared on max-height when expanding. To make the close instant,
   override transition on the non-.open state: */
.coach-panel-wrap:not(.open) {
  transition: none;
}

.coach-panel {
  margin-top: 10px;
  border: 1.5px solid var(--coach);
  border-radius: 6px;
  background: var(--surface);
  padding: 14px 16px;
  width: 414px;
}

body.theme-terminal .coach-panel {
  border-radius: 0;
}

.coach-panel-technique {
  font-size: 15px;
  font-weight: 700;
  color: var(--coach);
  margin-bottom: 6px;
  letter-spacing: 0.01em;
}

.coach-panel-text {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 0;
}

.coach-panel-text em {
  color: var(--coach);
  font-style: normal;
  font-weight: 600;
}

.coach-panel-text.coach-panel-note {
  margin-top: 8px;
  color: var(--text-muted);
}
```

**Implementation note on the close transition:** the v1 panel must close instantly per vspec §7.2. The straightforward CSS `transition: max-height 0.15s ease-out` declared on the base class would animate both directions. The `:not(.open) { transition: none }` rule above forces the close to be instant. An equivalent approach is to declare the transition only on `.open`:

```css
.coach-panel-wrap.open { transition: max-height 0.15s ease-out; max-height: 220px; }
.coach-panel-wrap     { transition: none; max-height: 0; }
```

Either form works. The Implementor picks the one that lints cleaner.

### 11.8 Recap toast — added to `css/controls.css`

```css
.coach-recap {
  display: none;
  margin-top: 10px;
  width: 414px;
  border-radius: 6px;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid var(--border);
  border-left: 4px solid var(--coach);
  background: var(--surface);
  animation: fadein 0.15s ease;
}

.coach-recap.visible {
  display: block;
}

.coach-recap.error {
  border-left-color: var(--conflict);
}

.coach-recap.error .coach-recap-line1 {
  color: var(--conflict);
}

.coach-recap-line1 {
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.coach-recap-line2 {
  color: var(--text-muted);
}

@keyframes fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}

body.theme-terminal .coach-recap {
  border-radius: 0;
}
```

Reuse the existing `--conflict` custom property from the v1 themes.

### 11.9 `.visually-hidden` utility — added to `css/base.css`

If not already present:

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

The existing `#sr-live` may already use a similar pattern; if so, factor it out into this utility class or reuse the existing rule. The Implementor verifies `base.css` and chooses.

---

## 12. Accessibility Wiring

### 12.1 Coach button

`coach.js` writes `aria-label`:
- `"Coach"` in idle state
- `"Coach (active)"` while `coachSession !== null && coachSession.recap === null`

The button has no `aria-pressed` because Coach is not a toggle — pressing it during an active session resets and re-runs analysis (per fspec §4.3). `aria-pressed` would be misleading.

### 12.2 Explanation panel

The panel root element (`<div class="coach-panel">` rendered inside `#coach-panel-wrap`) carries `role="region"` and `aria-label="Coach explanation"` (vspec §12.1). These are set when `coach.js` rebuilds the panel HTML in `_renderPanelContent`.

The panel is not focus-trapped. It is not a modal. Its content is read passively via the live-region announcement that fires when the user focuses a coached cell (§12.5).

### 12.3 Coached cells (`aria-describedby`)

Coached cells point `aria-describedby` at `#sr-coached-desc`. The cell-rendering function in `grid.js` (`_updateCell`, currently at line 91) is extended to read `state.coachSession?.coachedCells` and apply the attribute:

```js
// New lines added to _updateCell, after the existing class-management block
const coached = state.coachSession?.coachedCells.has(i) === true;
if (coached) {
  el.setAttribute('aria-describedby', 'sr-coached-desc');
} else {
  el.removeAttribute('aria-describedby');
}
```

`grid.js`'s `RELEVANT_KEYS` must be extended to include `'coachSession'` so cell renders fire on coach lifecycle changes:

```js
const RELEVANT_KEYS = new Set([
  'puzzle', 'pen', 'pencil', 'selected', 'conflicts', 'incorrect', 'won',
  'coachSession',                 // NEW
]);
```

### 12.4 Coached-cell CSS class application

`grid.js` is the only module that sets cell classes. To apply the `.coached-*` classes per the cell's role in the active step, extend `_updateCell` to consult `state.coachSession?.step?.roles`:

```js
// Pseudocode, inserted in _updateCell after existing class assignments
const session = state.coachSession;
if (session && session.recap === null) {
  const roles = session.step.roles;
  if (roles.target === i)                    el.classList.add('coached-target');
  if (roles.cause.includes(i))               el.classList.add('coached-cause');
  if (roles.elimTarget.includes(i))          el.classList.add('coached-elim-target');
  if (roles.unitMember.includes(i))          el.classList.add('coached-unit-member');
  if (roles.scA.includes(i))                 el.classList.add('coached-sc-a');
  if (roles.scB.includes(i))                 el.classList.add('coached-sc-b');
}
```

The `.includes()` calls are O(n) per cell × 81 cells = O(n²) per render in the worst case. For the role-array sizes encountered in practice (max ~16 cells for Jellyfish), this is well within budget. If profiling later shows it as a hotspot, precompute a per-render `Map<int, Set<role>>` once and look up by cell index.

The `session.recap === null` check ensures the classes are removed during a recap (fspec §10 lifecycle: when recap fires, "highlights clear").

### 12.5 Live-region announcements (full table)

Owned by `coach.js`. Source: vspec §12.2 + fspec §12.5.

| Trigger | Announcement |
|---|---|
| `COACH_START` dispatched (technique found) | `"Coach: ${step.technique} identified. ${step.coachedCells.size} cells highlighted."` |
| `COACH_NO_TECHNIQUE` (`reason='complete'`) | `"Coach: The puzzle is already solved."` |
| `COACH_NO_TECHNIQUE` (`reason='inconsistent'`) | `"Coach: The board has a contradiction. Use Erase to fix it."` |
| `COACH_FOCUS_COACHED_CELL` dispatched | `"Coached cell. ${step.technique}. ${stripEmphasis(step.supportingText)}"` (and, if `step.complexity.acknowledged`, append `" ${step.complexity.note}"`) |
| `COACH_FILL_RECAP` (`variant='normal'`) | `"You used ${technique}. ${detail sentence}"` |
| `COACH_FILL_RECAP` (`variant='error'`) | `"That's not the right digit — ${technique} suggestion still stands. Press Coach to try again."` |
| `COACH_FILL_RECAP` (`variant='elim'`) | `"Candidates eliminated. ${elim detail sentence}"` (from `_composeElimRecapDetail`) |
| `COACH_END` (silent reasons) | No announcement (the originating action — pen entry, erase, hint — already announces) |

`coach.js` dispatches the action *and then* announces, after observing the resulting state. (The reducer does not announce. Announcements are a UI concern.)

### 12.6 Auto-revealed candidates accessibility

Per `fspec-002-coach.md` §12.7, cells with auto-revealed pencil marks should distinguish coach marks from user marks in their `aria-label`. `grid.js`'s `_cellLabel` function constructs the label; extend it to consult `state.coachSession?.coachRevealedBits[i]`:

```js
// In _cellLabel, when describing pencil marks
if (penVal === 0 && pencil[i] !== 0) {
  const session = state.coachSession;
  const revealed = session?.coachRevealedBits[i] ?? 0;
  const userBits = pencil[i] & ~revealed;
  const coachBits = pencil[i] & revealed;
  const userMarks = iterate(userBits);
  const coachMarks = iterate(coachBits);
  if (coachMarks.length > 0 && userMarks.length > 0) {
    label += `: Coach candidates: ${coachMarks.join(', ')}. Your marks: ${userMarks.join(', ')}.`;
  } else if (coachMarks.length > 0) {
    label += `: Coach candidates: ${coachMarks.join(', ')}.`;
  } else {
    label += `: pencil marks ${userMarks.join(', ')}`;
  }
}
```

This is a best-effort accommodation per fspec §12.1.

### 12.7 Recap toast (`role="status"`)

`#coach-recap` is `role="status"` `aria-live="polite"` (set statically in `index.html`, §8.2). Screen readers will announce its text content automatically when it changes. `coach.js`'s explicit `srLive.announce()` call is technically redundant for the recap, but is included anyway for consistency with the rest of the announcement flow and to ensure the announcement fires on the assertive `#sr-live` region (more reliable cross-AT than the polite recap region alone).

---

## 13. Timer and Lifecycle Management

### 13.1 Timer ownership

Three timers are involved across the coach feature:

| Timer | Duration | Owner | Source |
|---|---|---|---|
| Recap auto-dismiss | 2.5 s | `coach.js` (module-level `_recapTimer`) | `fspec-002-coach.md` §2.5 |
| No-technique error toast auto-dismiss | 5.0 s | `coach.js` (module-level `_errorTimer`) | `fspec-002-coach.md` §4.2 |
| Pulse animation | 2 s loop | CSS `@keyframes coach-pulse` | `vspec-002-coach.md` §3.3 |

The first two are JavaScript `setTimeout` handles. The third is purely CSS and self-managing.

### 13.2 Timer-clear rules

A timer must be cleared when its corresponding visual state is interrupted:

| Trigger | Action on `_recapTimer` | Action on `_errorTimer` |
|---|---|---|
| Coach pressed during recap | Clear; dispatch `COACH_END { reason: 'session-reset' }` | n/a |
| Coach pressed during error toast | n/a | Clear; hide toast immediately |
| `NEW_PUZZLE` / `RESET_PUZZLE` / `CHANGE_DIFFICULTY` | Clear (the reducer already dispatched `COACH_END`; the `_renderRecap` clear-on-no-recap path covers this) | Clear (no event emits — handle in the same render loop's `_renderRecap`) |
| Win triggered during recap | Clear (via `COACH_END { reason: 'won' }` from reducer §4.8) | n/a (error toast does not coexist with a session) |

### 13.3 Why timers in `coach.js` and not the reducer

The reducer is intentionally synchronous and side-effect-free except for the existing `_scheduleClearIncorrect` setTimeout. Adding two more reducer-owned timers would couple the reducer to wall-clock time more than necessary. Instead, the recap/error timers live in `coach.js`, which already has the lifecycle state to manage them.

The `_scheduleClearIncorrect` precedent in the reducer is the exception, not the rule. It exists because the `incorrect` highlight's auto-clear is part of the v1 reducer's `CHECK` and `ON_COMPLETION_EVALUATE` semantics. The coach recap, by contrast, is purely a UI-level dismiss — there is no reducer-level state that needs to clear at 2.5 s; the `COACH_END` dispatch is a UI-driven event.

### 13.4 The recap timer fires `COACH_END`

When `_recapTimer` fires, `coach.js` dispatches `COACH_END { reason: 'recap-timeout' }`. The reducer's `COACH_END` handler (§3.2) runs the standard revert (which is a no-op for recap-state sessions per §3.3 step 5) and clears the slice. The next render cycle observes `coachSession === null` and `_renderRecap`'s "no reducer recap" path runs `_hideRecap`.

### 13.5 No timers persist across page reloads

Both timers are session-only. If the user reloads the page mid-recap, the saved state has no `coachSession` (it's not persisted), and the recap is gone. No restore is needed.

---

## 14. Directory Tree Delta

The following additions to `aspec-overview.md` §3 are required when this spec is approved:

```
js/
├── ui/
│   ├── coach.js                    # NEW — coach button, panel, recap, focus tracking, announcements
│   └── coachOverlay.js             # NEW — SVG arrow renderer
└── tests/
    ├── unit/
    │   └── coach/
    │       └── session.test.js      # NEW — reducer interaction tests for coach actions
    └── integration/
        └── coach.test.js            # NEW — Playwright end-to-end coach flow
```

The analyzer's directory delta from `aspec-coach-analyzer.md` §11 (`js/coach/analyzer.js`, `js/tests/unit/coach/analyzer.test.js`) is preserved; this spec adds files alongside.

The feature spec index in `aspec-overview.md` §11 also gains a new row:

| File | Contents | Loaded by |
|---|---|---|
| `aspec-coach-ui.md` | Coach Mode UI + reducer integration — CoachSession slice, COACH_* actions, ui/coach.js, ui/coachOverlay.js, pencil snapshot/restore, CSS, a11y wiring | Implementor (Phase 8b), Reviewer, QE |

---

## 15. Implementation Sequence

This module belongs to **Phase 8b**, sequenced strictly after Phase 8a (analyzer). The detailed sub-sequence:

### 15.1 Pre-conditions

Phase 8a must be complete:
- `js/coach/analyzer.js` exists and exports `analyze`.
- `js/tests/unit/coach/analyzer.test.js` is green.
- The `CoachStep` schema is producing real values for all 15 ranks.
- The technique-module `chain` extensions for ranks 12–15 (per `aspec-coach-analyzer.md` §12.1) are in place.

### 15.2 Phase 8b sub-sequence

1. **Reducer changes** (`js/game/state.js`):
   1. Add `coachSession: null` to the initial-state object.
   2. Add the six new action handlers (`COACH_START`, `COACH_END`, `COACH_FILL_RECAP`, `COACH_FOCUS_COACHED_CELL`, `COACH_FOCUS_OFF`, `COACH_NO_TECHNIQUE`).
   3. Modify `PEN_ENTER`, `ERASE`, `PENCIL_TOGGLE`, `HINT`, `NEW_PUZZLE`, `RESET_PUZZLE`, `CHANGE_DIFFICULTY`, `PUZZLE_LOADED`, `ON_COMPLETION_EVALUATE` per §4.
   4. Write reducer unit tests (§16.1).
2. **DOM and CSS** (`index.html`, `css/`):
   1. Add `#sr-coached-desc`, `#coach-overlay`, `#coach-panel-wrap`, `#coach-recap` to `index.html` (§8).
   2. Add `:root` custom properties (§11.1) and the `.visually-hidden` utility (§11.9).
   3. Add cell-state classes and pencil-mark `.coach-reveal` rule to `grid.css` (§11.4–11.5).
   4. Add overlay-positioning rule to `grid.css` (§11.6).
3. **Numpad layout restructuring** (`css/controls.css`, `js/ui/numpad.js`):
   1. Replace `.numpad-bottom` HTML with `.numpad-bottom-row1` + `.numpad-bottom-row2` (§10.1).
   2. Replace `.numpad-bottom` CSS with the two-row CSS (§11.2).
   3. Add the new `#btn-coach` button to the numpad template.
   4. Verify existing Hint and Check tests still pass.
4. **Coach button styling and recap/panel CSS** (`css/controls.css`):
   1. Add `.btn-coach.coaching` rule and pulse keyframes (§11.3).
   2. Add `.coach-panel-wrap` / `.coach-panel` rules (§11.7).
   3. Add `.coach-recap` rules (§11.8).
5. **Grid module changes** (`js/ui/grid.js`):
   1. Add `'coachSession'` to `RELEVANT_KEYS`.
   2. Extend `_updateCell` to apply `.coached-*` classes per role (§12.4).
   3. Extend `_updateCell` to apply `aria-describedby` (§12.3).
   4. Extend `_renderPencilMarks` to apply `.coach-reveal` class to coach-revealed bits (§12.6's bit math).
   5. Extend `_cellLabel` to mention coach candidates separately (§12.6).
6. **Coach UI module** (`js/ui/coach.js`):
   1. Implement `mount`, button click handler, focus tracking, panel render, recap render, error toast.
   2. Wire `srLive.announce` calls per §12.5.
   3. Wire `CustomEvent` dispatch for panel open/close (§6.8).
7. **Coach overlay module** (`js/ui/coachOverlay.js`):
   1. Implement `mount` with `CustomEvent` listener.
   2. Implement `_renderArrow` for all five Arrow styles.
   3. Implement coordinate helpers and SVG element factories.
8. **Bootstrap** (`js/main.js`):
   1. Add `mountCoach` and `mountCoachOverlay` imports.
   2. Insert the calls in the mount sequence per §9.1.
9. **Integration tests** (`js/tests/integration/coach.test.js`):
   1. Per-technique coach flow tests (§16.2).
   2. Cross-action interaction tests (PEN_ENTER on coached/non-coached cells, ERASE, HINT, NEW_PUZZLE, RESET, CHANGE_DIFFICULTY).
   3. Pencil revert tests.
   4. Recap dismiss timer tests.
   5. No-technique error toast tests.

### 15.3 Known minor edge cases (acknowledged, not blocking)

1. **Persistence during a session.** If the user reloads the page mid-session, the persisted `pencil[]` blob may include coach-revealed bits. On restore, those bits become "real" pencil marks. The session is gone; there is nothing to revert against. This is acceptable per `fspec-002-coach.md` §11.7 (sessions are not persisted) and §6.4 (revert behavior is session-scoped). Not worth fixing.
2. **Win during recap.** If a placement-fill triggers both a recap and a win (the placement was the last cell), the win-precedence rule (§4.8) collapses the recap. The user does not see "You used Naked Single." They see only the win banner. This matches `fspec-002-coach.md` §11.3 ("the recap does not appear").
3. **Coach pressed twice with same lowest-ranked technique applicable.** The session is reset and a fresh analysis runs. Because the analyzer is deterministic, the same `CoachStep` is produced. The user observes a brief flicker (highlights clear, then re-appear). Not a correctness issue.
4. **`PENCIL_TOGGLE` of a coach-revealed bit.** Handled correctly by §5.4 Example C. Documented.

### 15.4 Build-order risk

- **Schema lock.** Phase 8b implementation depends on the analyzer's `CoachStep` schema being stable. If a Phase 8a integration test reveals a needed schema change, the analyzer spec must be re-opened (Orchestrator approval) and `aspec-coach-ui.md` must be revised in lockstep. Mitigation: Phase 8a includes integration with at least one rendering smoke test before Phase 8b begins, to surface schema gaps early.

---

## 16. Test Strategy

### 16.1 Reducer unit tests (`js/tests/unit/coach/session.test.js`)

These tests mock `analyze()` and exercise the reducer in isolation. They run in Mocha+Chai with no DOM.

**`COACH_START` tests:**
1. With `result.type === 'no-technique'`, the slice remains `null`. (No emit-key change required to assert; behavior is "no mutation.")
2. With a `CoachStep` for rank 1 (Naked Single), the slice is populated; `coachRevealedBits` is all-zero (no auto-reveal); `pencil` is unchanged.
3. With a `CoachStep` for rank 4 (Naked Pair) where `autoReveal.cells = [{ cellIndex: 5, candidates: 0b00010100 }]` and `state.pencil[5] = 0b00000100`: after dispatch, `state.pencil[5] === 0b00010100`; `coachRevealedBits[5] === 0b00010000`.
4. `pencilSnapshot` matches the pre-`COACH_START` `state.pencil`, byte-for-byte.
5. `coachedCells` correctly unions all roles.

**`COACH_END` tests:**
1. With no active session, dispatch is a no-op; emit is empty (or specifically does not contain `'coachSession'`).
2. With an active session, slice → `null`; pencil reverts per §5.4.
3. Pencil revert preserves user `PENCIL_TOGGLE` mutations made during the session (Example B from §5.4).
4. Pencil revert correctly handles user toggling off coach-revealed bits (Example C).
5. Rank-1 session ends without touching pencil (Example D).

**`COACH_FILL_RECAP` tests:**
1. Setting `recap = 'normal'` clears `coachedCells`, sets `coachRevealedBits` to all-zero, reverts pencil, leaves slice non-null.
2. Setting `recap = 'error'` does the same with `recap: 'error'`.
3. Subsequent `COACH_END` revert is a no-op (already reverted in `COACH_FILL_RECAP`).
4. `COACH_FILL_RECAP { variant: 'elim' }` → `coachRevealedBits` zeroed, pencil state unchanged (no revert), `coachedCells` cleared, `recap = 'elim'`, slice non-null.
5. Subsequent `COACH_END` after `variant: 'elim'` → revert is a no-op; slice sets to `null`; pencil unchanged.

**`COACH_FOCUS_*` tests:**
1. `COACH_FOCUS_COACHED_CELL { index: 5 }` with index in `coachedCells` and `recap === null` sets `focusedCoachedCell = 5`.
2. `COACH_FOCUS_COACHED_CELL` during recap is a no-op.
3. `COACH_FOCUS_OFF` sets `focusedCoachedCell = null`.

**Cross-action tests:**
1. `PEN_ENTER` on a coached cell (placement, correct digit) → reducer dispatches `COACH_FILL_RECAP { variant: 'normal' }`.
2. `PEN_ENTER` on a coached cell (placement, wrong digit) → `COACH_FILL_RECAP { variant: 'error' }`.
3. `PEN_ENTER` on a coached cell (elimination) → `COACH_END { reason: 'fill-coached-elim' }`.
4. `PEN_ENTER` on a non-coached cell during a session → `COACH_END { reason: 'fill-non-coached' }`.
5. `PEN_ENTER` with `fromHint: true` → no coach action dispatched (the `HINT` handler dispatches its own `COACH_END`).
6. `ERASE` during a session → `COACH_END { reason: 'erase' }`.
7. `HINT` during a session → `COACH_END { reason: 'hint' }`. No `COACH_FILL_RECAP` even when the hinted cell was the coached cell.
8. `NEW_PUZZLE` clears `coachSession` to `null`.
9. `RESET_PUZZLE` clears `coachSession` to `null`.
10. `CHANGE_DIFFICULTY` during a session → `COACH_END { reason: 'puzzle-replaced' }`; pencil reverts.
11. `ON_COMPLETION_EVALUATE` producing a win during a recap → `COACH_END { reason: 'won' }`; slice → `null`.
12. `PENCIL_TOGGLE` during an elimination session with all `eliminationTargets` bits cleared → `COACH_FILL_RECAP { variant: 'elim' }` dispatched.
13. `PENCIL_TOGGLE` during an elimination session with only some targets cleared → no dispatch.
14. `PENCIL_TOGGLE` during a placement session (`eliminationTargets === null`) → no `COACH_FILL_RECAP` dispatch.
15. `PENCIL_TOGGLE` during a recap (`recap !== null`) → no `COACH_FILL_RECAP` dispatch.

### 16.2 Playwright integration tests (`js/tests/integration/coach.test.js`)

These tests boot the real app and drive it through the coach flow.

**Per-technique smoke tests (1 per rank):** load a fixture puzzle where rank N is the lowest applicable technique; press Coach; assert:
- Highlighted cells receive the correct `.coached-*` classes.
- Auto-reveal pencil marks appear for ranks 3–15 with `.coach-reveal` class.
- Auto-reveal does not appear for ranks 1–2.
- The Coach button has class `.coaching` and `aria-label="Coach (active)"`.
- Live region announced `"Coach: ${technique} identified. ${N} cells highlighted."`.

**Panel and overlay tests:**
1. Focus a coached cell; assert `.coach-panel-wrap.open` and `#coach-overlay.visible`.
2. Verify panel content: technique name, supporting text with `<em>` for `*…*`, complexity note for ranks 14/15.
3. Move focus to a non-coached cell; assert panel closes and overlay hides; highlights remain.
4. Move focus back to a coached cell; assert panel reopens.
5. Verify overlay SVG contains the expected number and types of arrow elements (matching `step.arrows`).

**Recap tests:**
1. Naked Single: focus target, type the correct digit; assert recap shows with `.visible`, no `.error`; line 1 is `"You used Naked Single."`; line 2 contains `"row R, column C"`; assert announcement.
2. Naked Single: type wrong digit; assert recap with `.error`; line 1 is the error message.
3. Hidden Single: same as above with `"row N"` / `"column N"` / `"box N"` formatting.
4. Naked Pair (elimination): type any digit in a pair cell; assert no recap appears; assert highlights clear silently.
5. Wait 2.5s after recap appears; assert recap dismisses (`.visible` removed).
6. Press Coach during recap; assert recap dismisses immediately and a fresh session begins.

**No-technique tests:**
1. Solve the puzzle (via hints or fixtures); press Coach; assert error toast `"The puzzle is already solved."` with `.error`; auto-dismiss after 5s.
2. Create an inconsistent board (manually); press Coach; assert error toast `"The board has a contradiction. Use Erase to fix it."`.

**Pencil revert tests:**
1. Press Coach (rank 4 fixture); assert pencil marks added with `.coach-reveal`.
2. Toggle a different pencil mark on (user mark); end session via non-coached cell fill; assert coach marks gone, user mark preserved.
3. Toggle off a coach-revealed mark; end session; assert pencil reverts to pre-session snapshot.

**Elimination completion tests:**
1. Locked Candidates session: switch to Pencil mode; remove the last indicated candidate from the last elimination-target cell; assert elim recap appears (`.visible`, no `.error`); line 1 is `"Candidates eliminated."`; line 2 contains the technique name and digit.
2. Locked Candidates session: remove some but not all indicated candidates from elimination-target cells; assert no recap appears (session highlights still active).
3. After elim recap: assert coach-revealed pencil marks are retained in all cells (not reverted); assert no `.coach-reveal` class changes.
4. After elim recap auto-dismisses (2.5s): assert session cleared (`coachSession === null`); pencil unchanged.
5. Press Coach again after elim recap completes: assert `analyze()` is called with current `pencil` state; assert the previously-suggested elimination technique is not re-suggested (candidates already cleared).

**Cross-action tests:**
1. Active session + Erase → session ends silently, pencil reverts.
2. Active session + Hint (in coached cell) → session ends silently, hint applies, no recap.
3. Active session + New Puzzle → confirmation dialog flow, then session ends, new puzzle loaded.
4. Active session + Reset → confirmation dialog flow, then session ends.
5. Active session + difficulty change → confirmation dialog flow, then session ends, hints reset.

**A11y test:**
1. Active session + Tab to coached cell → `aria-describedby="sr-coached-desc"` present.
2. Live region contains the focus announcement after focusing a coached cell.
3. Elim recap announced: live region contains `"Candidates eliminated."` and the detail sentence.

**Keyboard shortcut tests (CT-KB):**
1. CT-KB1: Pressing `C` with body focus on a puzzle board starts a coach session (identical to clicking the button).
2. CT-KB2: Pressing `C` while a `BUTTON` element has focus does trigger the coach (buttons are not form controls).

### 16.3 Coverage target

Per `aspec-overview.md` §7.2 — 100% branch coverage. The reducer's coach-action handlers are branchy (especially the `PEN_ENTER` cross-effect block). Each branch must be exercised by at least one unit or integration test.

`coach.js` and `coachOverlay.js` are integration-test-only — unit-testing them in isolation requires mocking the DOM and emitter, which yields tests that mostly assert mock interactions. Integration tests exercise real DOM and produce more useful coverage.

### 16.4 Test fixture reuse

The Phase 8a fixtures under `js/tests/fixtures/puzzles/coach/` (one per rank, per `aspec-coach-analyzer.md` §13.2) are reused by Phase 8b integration tests. The coach-flow integration test for rank N loads `rank-NN-<technique>.json`, presses Coach, and asserts both the analyzer output (already covered in 8a) and the UI behavior (new in 8b).

---

## 17. Non-Goals and Boundaries

This spec explicitly does not:

- **Modify the analyzer.** The `CoachStep` schema is sealed by `aspec-coach-analyzer.md`. Any change requires re-opening that spec.
- **Persist coach session state.** Sessions are session-only per `fspec-002-coach.md` §11.7. The persistence subscriber is unchanged.
- **Auto-fill cells.** The coach never fills a cell on the user's behalf (`fspec-002-coach.md` §11.6).
- **Block user input during coaching.** The user is free to ignore the coach (§5.3). All v1 actions (`PEN_ENTER`, `PENCIL_TOGGLE`, `ERASE`, `HINT`, navigation) work normally during a session.
- **Track coach use in stats.** Coach is not counted (`fspec-002-coach.md` §13). Statistics infrastructure is untouched.
- **Provide a technique reference panel.** Out of scope per fspec §13.
- **Implement mobile breakpoints.** Mobile is deferred per vspec §13. The `width: 414px` constants in CSS remain hardcoded; mobile support is a future spec.
- **Re-architect the UI module pattern.** `coach.js` and `coachOverlay.js` deviate slightly from the "single-root mount" pattern (§6.1, §7.1) because they coordinate DOM nodes across multiple containers. This deviation is bounded to these two modules and documented; it is not a precedent for new UI modules.

---

### Critical Files for Implementation
- /home/brc/Documents/websites/sudoku/js/ui/coach.js (new — primary UI module)
- /home/brc/Documents/websites/sudoku/js/ui/coachOverlay.js (new — SVG arrow renderer)
- /home/brc/Documents/websites/sudoku/js/game/state.js (reducer modifications: new actions, cross-action handlers, slice initialization)
- /home/brc/Documents/websites/sudoku/js/ui/grid.js (cell class application, `aria-describedby`, pencil-mark `.coach-reveal` styling, label changes)
- /home/brc/Documents/websites/sudoku/js/ui/numpad.js (template change for `#btn-coach` and the two-row bottom layout)
- /home/brc/Documents/websites/sudoku/index.html (DOM additions: overlay SVG, panel wrap, recap, hidden description span)
