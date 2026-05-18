# Architectural Spec — Erase All Pencil Marks

**ID:** aspec-erase-pencil
**Status:** Final
**Date:** 2026-05-17
**Author:** Architect
**Loaded by:** Implementor (Phase 10 — Erase All Pencil), Reviewer, QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — master directory tree, event-flow diagram, cross-cutting conventions.
> **Also load:** `aspec-game-state.md` (§4.2 GameState shape, §5 actions) — the reducer this spec extends.
> **Also load:** `aspec-undo.md` — the directly analogous feature; this spec mirrors its snapshot-capture (§3.1), coach-termination (§4.3), button-state (§5), persistence (§9), and emit-key (§10) patterns.
> **Also load:** `aspec-coach-ui.md` (§3.2 COACH_END, §5 pencil revert, §10 numpad layout) — interaction with coach session lifecycle.

---

## Table of Contents

1. [Scope and Feasibility](#1-scope-and-feasibility)
2. [Architectural Risk Assessment](#2-architectural-risk-assessment)
3. [The `ERASE_ALL_PENCIL` Action](#3-the-erase_all_pencil-action)
4. [No-Op Guard](#4-no-op-guard)
5. [Snapshot Capture](#5-snapshot-capture)
6. [Coach Termination](#6-coach-termination)
7. [Emit Keys](#7-emit-keys)
8. [Button State Rules](#8-button-state-rules)
9. [HTML / CSS Changes](#9-html--css-changes)
10. [SR Announcement](#10-sr-announcement)
11. [Persistence Interaction](#11-persistence-interaction)
12. [Test Implications](#12-test-implications)
13. [Implementation Sequence](#13-implementation-sequence)

---

## 1. Scope and Feasibility

**Verdict: feasible with no architectural risk.** The feature is a near-exact structural clone of the single-cell `ERASE` pencil-clear branch (`aspec-undo.md` §3.1 / `state.js` `case 'ERASE'`) widened to all 81 cells. It introduces one new action (`ERASE_ALL_PENCIL`, no payload), reuses the already-shipped `_captureUndoSnapshot()` helper and `undoSnapshot` field verbatim, adds one button to an already-existing `.numpad-undo-row`, and converts that row from full-width to a 2-column grid. No new modules, no new state fields, no build-step impact, no server-side code. Cost is one 81-iteration zeroing loop plus the standard 243-byte snapshot copy — orders of magnitude under the 1 s budget.

The existing "Erase" → "Clear" rename (`id="btn-clear"`, `aria-label="Clear selected cell"`) is **already in the codebase** (`numpad.js` line 44, 80). The internal single-cell `ERASE` action and its reducer handler are unchanged. This spec adds a *separate* bulk action and a *separate* button; it does not touch the single-cell `ERASE` path.

**No requirements required feasibility negotiation.** All requirements map cleanly onto the existing reducer/emitter architecture.

---

## 2. Architectural Risk Assessment

| Area | Risk | Assessment |
|---|---|---|
| **Reducer complexity** | **Low** | One new `case` in the existing `switch`. The body is a no-op guard, a single `_captureUndoSnapshot()` call, an 81-cell `state.pencil` zeroing loop, the established coach-termination block, and one `_emit`. No new branching topology, no interaction with `pen`, `conflicts`, `correctness`, `won`, `attemptRecorded`, or `hintsRemaining`. Strictly simpler than the existing `ERASE` case (which has two mutating branches). |
| **Undo integration** | **Low** | Reuses the shipped `_captureUndoSnapshot()` helper and `undoSnapshot` field with zero modification. `pencil` is already a snapshotted field (`aspec-undo.md` §2). The existing `UNDO` handler restores `state.pencil` in full via `state.pencil.set(snap.pencil)` — it has no knowledge of *which* action captured the snapshot, so a bulk pencil wipe undoes correctly with no `UNDO`-side changes. The only subtlety — preserving the prior snapshot on a no-op — is handled identically to `ERASE`'s empty-cell path (capture occurs *inside* the guarded branch only). Risk is bounded by the already-validated undo design. |
| **Coach interaction** | **Low** | `ERASE_ALL_PENCIL` uses the **same `dispatch({ type: 'COACH_END', reason: 'erase' })` mechanism the single-cell `ERASE` already uses**. The correct precedent for an *erase* action is `ERASE`'s `COACH_END` dispatch (see §6 for full rationale). The mechanism is established, tested precedent. The bulk wipe does not corrupt the coach pencil-revert formula because the formula operates per-cell with bit math and a session-end after a full wipe simply finds nothing to restore. No new coach edge cases. |
| **CSS / layout** | **Low** | `.numpad-undo-row` changes from `width: 100%` single-column to a 2-column grid copied verbatim from the already-present `.numpad-utils` rule. The only visual risk is label overflow on narrow viewports ("Erase all pencil" is longer than "Undo"); mitigated by the existing `.btn` flex/wrap behavior already proven by the two-line mode button. One-line smoke note for the Implementor to eyeball narrow-width rendering. |
| **Test surface** | **Low–Medium** | New unit branches: the no-op guard (no pencil marks), the mutating path, the generating/won/no-puzzle button-disable conditions, and the coach-termination branch. Volume is moderate (≈8 unit + 3 integration + 1 a11y) but each test is mechanically simple and follows existing `S##`/`GF##`/`A##` patterns. The "all `pencil[]` zero" predicate appearing in three places (reducer no-op guard, button-disabled rule, click-handler re-guard) must agree; a shared private helper reduces drift risk (see §3.2). |

**Overall verdict: LOW.** This is among the lowest-risk features in the project. It is a structural clone of validated, shipped code (`ERASE` + `undo`). The single design decision requiring adjudication — coach-termination mechanism — is resolved in §6 with explicit rationale. No requirement is infeasible; nothing returns to the Functional Designer.

---

## 3. The `ERASE_ALL_PENCIL` Action

### 3.1 Definition

`ERASE_ALL_PENCIL` takes **no payload**: `{ type: 'ERASE_ALL_PENCIL' }`. It is dispatched only by `numpad.js`'s new button click handler (§8). It is never dispatched internally by another handler and never by the keyboard module (no shortcut in v1, per requirements).

### 3.2 Position in the reducer

Add the `case 'ERASE_ALL_PENCIL'` block **immediately after the existing `case 'ERASE'` block** and **before `case 'UNDO'`**. Rationale: it is the conceptual sibling of `ERASE`; co-locating keeps the two erase semantics adjacent for the Reviewer.

A shared private predicate is added to `createGameState` (near `_isBoardFull`) to centralize the "no pencil marks anywhere" test used by the reducer guard:

```js
/** Returns true if no cell has any pencil mark set. */
function _hasNoPencil() {
  for (let i = 0; i < 81; i++) {
    if (state.pencil[i] !== 0) return false;
  }
  return true;
}
```

The full handler:

```js
case 'ERASE_ALL_PENCIL': {
  if (!state.puzzle) break;             // no puzzle loaded
  if (state.won === true) break;        // symmetry with ERASE/PEN_ENTER won-guard
  if (state.generating === true) break; // defensive: no stable board
  if (_hasNoPencil()) break;            // no-op: nothing to erase, prior snapshot survives

  _captureUndoSnapshot();               // BEFORE mutation — mirrors ERASE §3.1

  for (let i = 0; i < 81; i++) {
    state.pencil[i] = 0;
  }

  _emit(action, 'pencil', 'undoSnapshot');

  if (state.coachSession !== null) {
    dispatch({ type: 'COACH_END', reason: 'erase' });
  }
  break;
}
```

Note `_emit` runs **before** the coach `COACH_END` dispatch — identical ordering to the existing `ERASE` case, so the coach session change emits as its own separate `'changed'` event (the established convention in `aspec-coach-ui.md` §4.10).

---

## 4. No-Op Guard

**Exact condition:** `_hasNoPencil()` returns `true` (every `state.pencil[i] === 0` for `i` in `0..80`).

**Behavior when the guard trips:**
- `break` before `_captureUndoSnapshot()` — **no snapshot captured**. Any pre-existing `undoSnapshot` from a prior real move is preserved untouched (identical guarantee to `ERASE`'s empty-cell path, `aspec-undo.md` §3.1).
- **No `_emit`** — no `'changed'` event, therefore no grid re-render and no persistence write.
- Coach session, if active, is **not** ended (the `COACH_END` dispatch is after the guard `break`). A no-op erase-all is fully inert.

The other three guards (`!state.puzzle`, `state.won`, `state.generating`) also `break` with no capture/emit — defense in depth against a stale-state dispatch, consistent with the button-disabled rule (§8).

---

## 5. Snapshot Capture

Mirrors `aspec-undo.md` §3.1 `ERASE` pattern exactly. Uses the **already-shipped** `_captureUndoSnapshot()` helper with **no modification**.

**Placement:** after all four no-op guards, before the zeroing loop (shown in §3.2). Direct capture (not the temporary-then-commit pattern used by `PEN_ENTER`) is safe and correct here because once past the guards the mutation is unconditional and always real — exactly as in `PENCIL_TOGGLE` and the single-cell pencil-erase branch (`aspec-undo.md` §3.1: "A pencil toggle is always a real mutation once past the guards, so direct capture is safe here").

Snapshot arrays are fresh copies (`new Uint16Array(state.pencil)` captures the full pre-wipe pencil grid); on `UNDO`, `state.pencil.set(snap.pencil)` restores every cleared mark in one in-place operation with no `ERASE_ALL_PENCIL`-side work. `pen`, `hintsRemaining`, `attemptRecorded` are captured too (helper invariant) and are no-ops to restore here since this action does not touch them — captured for structural symmetry per `aspec-undo.md` §2.

---

## 6. Coach Termination

**Decision: dispatch `{ type: 'COACH_END', reason: 'erase' }` — identical to the existing single-cell `ERASE` handler (`aspec-coach-ui.md` §4.3).**

### 6.1 Reconciling the requirement brief

The Orchestrator's brief states: *"same pattern as `UNDO` uses (direct `state.coachSession = null`, NOT a `COACH_END` dispatch). Rationale mirrors `aspec-undo.md` §4.3 exactly."*

This instruction is **internally inconsistent with the established architecture** and is resolved as follows:

- `aspec-undo.md` §4.3's rationale for direct-null is specific to `UNDO`: `UNDO` performs a **full `pencil` restore from `snap.pencil`**, which entirely supersedes and would waste the `COACH_END` per-cell revert formula. That rationale **does not transfer** to `ERASE_ALL_PENCIL`, which does *not* restore pencil — it *zeroes* it forward.
- The correct precedent for an *erase* action is the existing single-cell `ERASE`, which dispatches `COACH_END { reason: 'erase' }`. `ERASE_ALL_PENCIL` is semantically "erase, but all cells," so it must use the **same** coach mechanism for behavioral consistency.
- Using direct-null here would be a behavioral divergence between `ERASE` and `ERASE_ALL_PENCIL` with no architectural justification, and would skip the `COACH_END` pencil-revert (`_revertPencil`) path.

**This deviation from the literal brief is flagged.** The Architect adopts `COACH_END { reason: 'erase' }` as the architecturally sound choice; it requires no functional-spec change or user negotiation and strictly aligns `ERASE_ALL_PENCIL` with `ERASE`.

### 6.2 Correctness of `COACH_END` after a full wipe

`COACH_END`'s board effect is `_revertPencil(session)`, which for each cell recomputes `pencil[i]` from snapshot and current bits. After `ERASE_ALL_PENCIL` zeroed `state.pencil`, the revert may re-introduce coach-revealed bits per the formula — yielding the user's non-coach pencil bits as they were at `COACH_START`. This is the **existing, accepted `ERASE` + coach behavior** (single-cell `ERASE` of a coached cell triggers the identical path); `ERASE_ALL_PENCIL` inherits it unchanged. The subsequent `UNDO` (if invoked) restores the pre-wipe pencil array in full via `snap.pencil`, which is the authoritative recovery path. No new edge case is introduced.

---

## 7. Emit Keys

### 7.1 `ERASE_ALL_PENCIL` (mutating path)

```js
_emit(action, 'pencil', 'undoSnapshot');
```

| Key | Why |
|---|---|
| `pencil` | The 81-cell pencil grid is wiped — grid must re-render cleared cells; persistence writer must serialize the new (empty) `pencil` blob. |
| `undoSnapshot` | Set to a fresh non-null snapshot — `numpad.js` must re-render the Undo button to *enabled* and the Erase-all button to *disabled* (board now has no pencil marks; §8). `'undoSnapshot'` is already in `numpad.js` `RELEVANT_KEYS`. |

This is exactly the `ERASE` pencil-branch emit set. `pen`, `conflicts`, `incorrect`, `hintsRemaining`, `attemptRecorded`, `won` are deliberately **omitted** — `ERASE_ALL_PENCIL` does not touch them.

The follow-on `COACH_END` dispatch (§6) produces its **own** separate `'changed'` emit carrying `'coachSession', 'pencil'` — `coach.js` tears down the panel/overlay/recap on that event. `ERASE_ALL_PENCIL` does **not** add `'coachSession'` to its own emit; the separate `COACH_END` event is the established notification path (identical to `ERASE`, `aspec-coach-ui.md` §4.10).

### 7.2 No-op path

Emits nothing (guard `break` precedes `_emit`). No persistence write, no re-render — prior `undoSnapshot` preserved (§4).

---

## 8. Button State Rules

A new button `#btn-erase-all` (classes `btn btn-erase-all`) is rendered by `numpad.js` in `.numpad-undo-row`, to the **left** of `#btn-undo` (reading order: Erase-all, Undo).

### 8.1 `RELEVANT_KEYS`

`numpad.js` `RELEVANT_KEYS` already contains `'puzzle'`, `'won'`, `'undoSnapshot'`, `'generating'`. The disabled rule depends on `state.pencil` changing, signalled via the `'pencil'` change key. **`'pencil'` must be added to `RELEVANT_KEYS`.** Without it, `_update` would not re-run when pencil marks are added/removed and the button's enabled state would be stale — the direct analogue of `aspec-undo.md` §5's requirement that `'undoSnapshot'` be in `RELEVANT_KEYS`.

Final `RELEVANT_KEYS` set: `['puzzle', 'selected', 'activeMode', 'hintsRemaining', 'won', 'completionMessage', 'undoSnapshot', 'generating', 'pencil']`.

### 8.2 `_update` disabled logic

Add to `numpad.js` `_update(state)`, alongside the existing Undo-button block:

```js
const eraseAllBtn = _root.querySelector('#btn-erase-all');
if (eraseAllBtn) {
  let hasPencil = false;
  if (state.puzzle) {
    for (let i = 0; i < 81; i++) {
      if (state.pencil[i] !== 0) { hasPencil = true; break; }
    }
  }
  eraseAllBtn.disabled =
    state.generating === true ||
    state.won === true ||
    !state.puzzle ||
    !hasPencil;
}
```

This is the exact disabled predicate the requirements specify. The pencil scan is local to `_update` (the UI cannot import the reducer's private `_hasNoPencil`); the two predicates are logically identical and both covered by tests (§12) to guard against drift.

### 8.3 Click handler

Added in `_buildNumpad`, after the existing `#btn-undo` handler:

```js
_root.querySelector('#btn-erase-all').addEventListener('click', () => {
  const s = _gameState.getState();
  if (s.generating || s.won || !s.puzzle) return;
  let hasPencil = false;
  for (let i = 0; i < 81; i++) {
    if (s.pencil[i] !== 0) { hasPencil = true; break; }
  }
  if (!hasPencil) return;
  _gameState.dispatch({ type: 'ERASE_ALL_PENCIL' });
  announce('All pencil marks erased');
});
```

The re-guard mirrors `#btn-undo`'s defensive re-check — the reducer guards independently (§4), so this is belt-and-suspenders and ensures the SR announcement only fires on a real mutation.

### 8.4 Toolbar focus pattern

Automatic. The existing `_root.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()))` loop runs after the template is injected, so `#btn-erase-all` receives `mousedown` preventDefault with no extra code — same mechanism as `#btn-undo` and `#btn-coach` (`aspec-undo.md` §5).

---

## 9. HTML / CSS Changes

### 9.1 `numpad.js` template

Modify the `.numpad-undo-row` block to contain two buttons, Erase-all first:

```html
<div class="numpad-undo-row">
  <button class="btn btn-erase-all" id="btn-erase-all"
          aria-label="Erase all pencil marks" disabled>Erase all pencil</button>
  <button class="btn btn-undo" id="btn-undo" aria-label="Undo last move" disabled>Undo</button>
</div>
```

- Visible label: **`Erase all pencil`** (per requirement).
- `aria-label="Erase all pencil marks"` — slightly expanded for SR clarity, consistent with the pattern of `#btn-clear`'s `aria-label` being fuller than its visible "Clear".
- Ships `disabled` in the template: correct initial state (no pencil marks at mount; also correct after refresh-restore). `_update` overrides on every relevant `'changed'`.

### 9.2 `css/controls.css`

Replace the current `.numpad-undo-row` rule:

```css
/* REMOVE: */
.numpad-undo-row {
  width: 100%;
}

.numpad-undo-row .btn-undo {
  width: 100%;
}

/* REPLACE WITH: */
.numpad-undo-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
```

The `.numpad-undo-row .btn-undo { width: 100% }` rule is **deleted** — grid items fill their `1fr` track automatically, matching `.numpad-utils` behavior. No `.btn-erase-all`-specific width is needed.

No new theme custom properties; `.btn-erase-all` inherits standard `.btn` and `.btn:disabled` styling. **No `themes.css` change.** No other CSS file changes.

**Resulting numpad layout:** digits grid, then three 2-column rows — `.numpad-utils` (Clear / Mode), `.numpad-undo-row` (Erase all pencil / Undo), `.numpad-bottom-row1` (Hint / Coach) — then full-width `.numpad-bottom-row2` (Check). Matches the stated requirement of three rows of two buttons.

---

## 10. SR Announcement

On a successful execution, `numpad.js`'s click handler calls `announce('All pencil marks erased')` via the already-imported `import { announce } from './srLive.js'`.

- **Text: "All pencil marks erased"** — concise, unambiguous, no cell coordinates (action affects all 81 cells — same reasoning as `aspec-undo.md` §8).
- Announced **only on a real mutation**: the click-handler re-guard (§8.3) returns before `announce()` on any no-op/disabled condition.
- No keyboard path exists (no v1 shortcut), so there is no keyboard-vs-button announcement split.

---

## 11. Persistence Interaction

**No change to the persistence writer or `aspec-persistence.md` is required.** Reasoning mirrors `aspec-undo.md` §9 exactly:

- The persistence writer serializes only `{ puzzle, pen, pencil, hintsRemaining, attemptRecorded }`. `ERASE_ALL_PENCIL`'s `_emit` includes `'pencil'`, which intersects the writer's trigger set, so the existing debounced subscriber schedules a normal write of the now-empty pencil grid. No new wiring.
- `undoSnapshot` is not persisted (excluded by omission). On refresh-restore it initializes to `null` — Undo button starts disabled, Erase-all starts disabled (no pencil restored), both correct.
- A no-op `ERASE_ALL_PENCIL` does not emit (§4/§7.2), so it triggers no persistence write.

---

## 12. Test Implications

All tests run under the existing Mocha/Chai + Playwright harness; **100% branch coverage required** (`aspec-overview.md` §7.2). State unit tests use `S##` (highest existing: S77), integration tests use `GF##` (highest existing: GF19), a11y uses `A##` (highest existing: A21).

### 12.1 New unit tests — `js/tests/unit/state.test.js`

Add inside `describe('game/state.js')`, in a new `describe('ERASE_ALL_PENCIL')` block after the `describe('UNDO')` block:

- **S78** — `ERASE_ALL_PENCIL` with pencil marks in several cells zeroes every `state.pencil[i]`; `undoSnapshot` becomes non-null with `snapshot.pencil` deep-equal to the pre-wipe array (value compare, distinct typed-array reference).
- **S79 (no-op preservation, all-zero)** — with `state.pencil` all-zero, `ERASE_ALL_PENCIL` is a no-op: `undoSnapshot` unchanged (set up a prior real move so a snapshot exists; assert it survives), no `'changed'` emit (spy assertion), `pencil` still all-zero.
- **S80 (no-op, no puzzle)** — before any `PUZZLE_LOADED`, `ERASE_ALL_PENCIL` is inert: no throw, no emit, `undoSnapshot` null.
- **S81 (won guard)** — drive a board to `won === true`; `ERASE_ALL_PENCIL` is a no-op (pencil and snapshot unchanged).
- **S82 (generating guard)** — `SET_GENERATING true` with pencil marks present; `ERASE_ALL_PENCIL` is a no-op.
- **S83 (undo round-trip, critical)** — set pencil marks across many cells, `ERASE_ALL_PENCIL`, then `UNDO`: every pencil mark is restored exactly to its pre-wipe value; `undoSnapshot` null after undo.
- **S84 (no-op does not destroy prior snapshot)** — `PENCIL_TOGGLE` (captures snapshot), `ERASE_ALL_PENCIL` (clears marks, captures new snapshot), `ERASE_ALL_PENCIL` again (now all-zero → no-op, must NOT overwrite the snapshot): one `UNDO` restores the toggled marks. Analogue of `aspec-undo.md` U9.
- **S85 (coach termination)** — start a coach session (`COACH_START`), keep some pencil marks, `ERASE_ALL_PENCIL`: assert `COACH_END` was dispatched (`state.coachSession === null` afterward) and that the `ERASE_ALL_PENCIL` emit and the `COACH_END` emit are **two distinct `'changed'` events** (first carrying `'pencil','undoSnapshot'`, second carrying `'coachSession','pencil'`).
- **S86 (emit keys)** — assert the `ERASE_ALL_PENCIL` mutating emit `changed` Set equals exactly `{'pencil','undoSnapshot'}`; assert the no-op path emits nothing.

### 12.2 Integration tests — `js/tests/integration/game-flows.test.js`

Append, continuing `GF##` numbering:

- **GF20** — Erase-all button lifecycle: disabled at load; after a `PENCIL_TOGGLE` via pencil-mode numpad it enables; clicking it clears all pencil marks from the rendered grid DOM and re-disables itself; the `srLive` region announces "All pencil marks erased".
- **GF21** — Erase-all → Undo end-to-end: pencil-mark several cells via the UI, click "Erase all pencil" (marks visibly clear, Undo enables), click Undo, assert all pencil marks reappear in the rendered grid DOM and Erase-all re-enables.
- **GF22** — Coach + Erase-all: open Coach (panel visible), click "Erase all pencil", assert the coach panel/overlay/recap is removed from the DOM and the pencil grid is cleared.

### 12.3 a11y test — `js/tests/integration/a11y.test.js`

- **A22** — `#btn-erase-all` has `aria-label="Erase all pencil marks"` and visible text `Erase all pencil`; its `disabled` attribute is present at load, absent after a pencil mark is added, and present again after `ERASE_ALL_PENCIL` fires — mirrors A21's `undoSnapshot`-coupled assertion for `#btn-undo`.

### 12.4 Coverage note

New branches requiring an exercising test for the 100% gate: the four reducer guards (`!puzzle`, `won`, `generating`, `_hasNoPencil`), the `_hasNoPencil` true/false outcomes, the mutating path, the `state.coachSession !== null` true/false branch in the new case, and `numpad.js`'s new `eraseAllBtn` disabled-predicate branches plus the click-handler re-guard early-returns. Each is covered by an S##/GF##/A## above.

---

## 13. Implementation Sequence

This is **Phase 10**, appended to `aspec-overview.md` §8. Add to the `aspec-overview.md` §11 Feature Spec Index:

| File | Contents | Loaded by |
|---|---|---|
| `aspec-erase-pencil.md` | Erase-all-pencil — `ERASE_ALL_PENCIL` action, numpad button, 2-column undo row | Implementor (Phase 10), Reviewer, QE |

**Sequence:**

1. `js/game/state.js` — add `_hasNoPencil()` helper near `_isBoardFull`; add `case 'ERASE_ALL_PENCIL'` immediately after `case 'ERASE'` and before `case 'UNDO'`, exactly per §3.2 (four guards, `_captureUndoSnapshot()`, 81-cell zero loop, `_emit(action,'pencil','undoSnapshot')`, then `if (state.coachSession !== null) dispatch({ type: 'COACH_END', reason: 'erase' })`).
2. `js/tests/unit/state.test.js` — add `describe('ERASE_ALL_PENCIL')` with S78–S86.
3. `js/ui/numpad.js` — add `#btn-erase-all` to the `.numpad-undo-row` template (Erase-all before Undo, §9.1); add the click handler after the `#btn-undo` handler (§8.3); add the `eraseAllBtn` disabled block to `_update` (§8.2); add `'pencil'` to `RELEVANT_KEYS` (§8.1).
4. `css/controls.css` — replace `.numpad-undo-row` with the 2-column grid and delete `.numpad-undo-row .btn-undo` (§9.2).
5. `js/tests/integration/game-flows.test.js` — add GF20–GF22.
6. `js/tests/integration/a11y.test.js` — add A22.
7. Run the full suite; confirm 100% branch coverage; manual smoke per `aspec-overview.md` §9.2, including a narrow-viewport check that "Erase all pencil" does not visually overflow its grid track.

No deployment-procedure change — `deploy.txt` already enumerates `js/`, `css/`, `index.html`; no new files. No keyboard module change (no v1 shortcut). No persistence-writer change (§11).
