# Review Report — Phase 9 (One-Level Undo)

**Date:** 2026-05-17  
**Reviewer:** Code Review Team  
**Status:** SIGN-OFF WITH NON-BLOCKING OBSERVATION  

---

## Executive Summary

The Phase 9 (One-Level Undo) implementation faithfully matches the architectural spec (`aspec-undo.md`), functional spec (`fspec-001-v1.md` §5.1, §5.2, §9.7, §14.1, §14.3), and visual design spec (`vspec-001-v1.md` §4.5, §5.8, §10.5). All three production files and both test suites have been thoroughly reviewed and verified.

**Verdict:** Implementation is correct and complete. One observation from QE regarding pre-existing defensive code is noted below as non-blocking.

---

## Review Methodology

1. **Architectural Spec Review** (aspec-undo.md full read):
   - Snapshot storage (§2): field shape, capture target fields
   - Snapshot lifecycle (§3): capture conditions, clearing conditions, timing rules
   - UNDO action (§4): guards, mutation sequence, coach interaction, stats handling
   - Button state rules (§5): disabled conditions, RELEVANT_KEYS, click handler
   - Keyboard shortcut (§6): key combo, focus guard, guard-off behavior
   - HTML/CSS changes (§7): template structure, row placement, CSS rules

2. **Functional Spec Cross-check** (fspec-001-v1.md §9.7, §14.3):
   - Undo availability (move-level, not state-level)
   - One-level-only enforcement
   - Session-only persistence (no resume)
   - Won-state block
   - Auto-clear pencil restoration
   - Screen reader announcement "Last move undone"

3. **Visual Design Spec Cross-check** (vspec-001-v1.md §4.5, §5.8, §10.5):
   - Undo button appearance (standard .btn inherit)
   - Button width (100% of row)
   - Button label and aria-label
   - Disabled state styling (opacity 0.38, cursor not-allowed)
   - Keyboard shortcut spec (§10.5)

4. **Production Code Review**:
   - `js/game/state.js` (798 lines): state shape, _captureUndoSnapshot(), _applyPenEnter, UNDO action, snapshot clearing, emit keys
   - `js/ui/numpad.js` (240 lines): template, RELEVANT_KEYS, _update logic, click handler, grid preservation
   - `js/ui/keyboard.js` (86 lines): Ctrl+Z/Cmd+Z block, focus guards, dispatch condition
   - `css/controls.css` (463 lines): .numpad-undo-row and .btn-undo rules

5. **Test Coverage Review** (508 passing tests):
   - Unit tests (S55–S77 in state.test.js): 19 tests covering UNDO action, snapshot capture, no-op preservation, one-level-only, emit keys, coach interaction, guards
   - Integration tests (GF15–GF19 in game-flows.test.js): 5 tests covering button enable/disable, auto-clear restoration, coach+undo, keyboard variants, session-only behavior
   - A11y test (A21 in a11y.test.js): aria-label and disabled toggle

---

## Detailed Verification

### A. Snapshot Storage (aspec §2)

**Spec requirement:** `undoSnapshot` field with `pen`, `pencil`, `hintsRemaining`, `attemptRecorded` captured as copies.

**Code verification:**
- ✓ Field added to GameState typedef (state.js lines 26–31, 50)
- ✓ Initialized to null in createGameState (state.js line 98)
- ✓ _captureUndoSnapshot() helper (state.js lines 117–124) captures all four fields as copies:
  - `pen: new Uint8Array(state.pen)` — fresh copy
  - `pencil: new Uint16Array(state.pencil)` — fresh copy
  - `hintsRemaining: state.hintsRemaining` — scalar copy
  - `attemptRecorded: state.attemptRecorded` — boolean copy

**Verdict:** ✓ Matches spec exactly.

---

### B. Snapshot Lifecycle (aspec §3)

#### B.1 Actions that SET the snapshot

**Spec:** Exactly three actions capture: PEN_ENTER, PENCIL_TOGGLE, ERASE. Capture only after no-op guards, before mutation.

**Code verification:**

**PEN_ENTER (state.js lines 308–342):**
- ✓ Temporary-capture pattern: `const pending = { pen: ..., pencil: ..., ... }` before _applyPenEnter
- ✓ _applyPenEnter returns boolean (true on mutation, false on no-op)
- ✓ Snapshot assigned only on `if (mutated)` (line 317)
- ✓ All no-op guards in _applyPenEnter (lines 171–176) return false:
  - `!state.puzzle` (line 171)
  - given cell (line 172)
  - `state.won` (line 173)
  - same digit (line 176)
- ✓ Board-full path returns true (line 202) — mutation did occur before chain dispatch

**PENCIL_TOGGLE (state.js lines 344–376):**
- ✓ Guards (state.selected, !state.puzzle, given, pen digit, won) break before line 351
- ✓ _captureUndoSnapshot() called after guards, before bit toggle (line 351)
- ✓ Emit includes 'undoSnapshot' (line 374)

**ERASE (state.js lines 378–402):**
- ✓ Guards (selected, !puzzle, given, won) break before mutation
- ✓ Pen-branch captures (line 386) then mutates (line 387)
- ✓ Pencil-branch captures (line 393) then mutates (line 394)
- ✓ Empty-cell branch (neither pen nor pencil) does NOT capture and does NOT emit — prior snapshot survives
- ✓ Both mutating branches emit 'undoSnapshot' (lines 391, 395)

**Verdict:** ✓ All three actions implement spec-correct capture timing.

#### B.2 Actions that CLEAR the snapshot

**Spec:** PUZZLE_LOADED, NEW_PUZZLE, RESET_PUZZLE, CHANGE_DIFFICULTY set `undoSnapshot = null` and include 'undoSnapshot' in emit.

**Code verification:**

- ✓ PUZZLE_LOADED (state.js line 232): `state.undoSnapshot = null` in reset block; 'undoSnapshot' in emit (line 237)
- ✓ NEW_PUZZLE (state.js line 586): `state.undoSnapshot = null` in reset block; 'undoSnapshot' in emit (line 591)
- ✓ RESET_PUZZLE (state.js line 613): `state.undoSnapshot = null` in reset block; 'undoSnapshot' in emit (line 617)
- ✓ CHANGE_DIFFICULTY (state.js line 630): `state.undoSnapshot = null`; 'undoSnapshot' in emit (line 631)

**Actions NOT touched (spec requirement):**
- ✓ HINT (lines 446–494): no undoSnapshot capture or clearing (never mentioned)
- ✓ CHECK (lines 496–505): no undoSnapshot mutation
- ✓ SELECT_CELL, DESELECT, ARROW_NAV, SET_MODE, TOGGLE_MODE, CLEAR_INCORRECT, ON_COMPLETION_EVALUATE: all omit undoSnapshot
- ✓ COACH_START (lines 654–722): no snapshot capture; only coachSession mutated
- ✓ COACH_END (lines 724–731): no snapshot touching

**Verdict:** ✓ Snapshot lifecycle exactly matches spec.

---

### C. The UNDO Action (aspec §4)

#### C.1 Guards

**Spec (§4.1):** Three guards in order: undoSnapshot===null, won, generating.

**Code (state.js lines 404–407):**
```js
case 'UNDO': {
  if (state.undoSnapshot === null) break;   // guard 1
  if (state.won === true) break;            // guard 2
  if (state.generating === true) break;     // guard 3
```

**Verdict:** ✓ Exact match.

#### C.2 Mutation Sequence

**Spec (§4.2) requires exact order:**

1. Direct null of coachSession (not COACH_END dispatch)
2. Restore pen/pencil in place with .set()
3. Restore stats fields
4. Recompute conflicts
5. Clear incorrect/incorrectShownUntil/completionMessage and cancel timer
6. Consume snapshot (null)
7. selected/activeMode untouched
8. Emit with full key set

**Code (state.js lines 409–443):**
```js
const snap = state.undoSnapshot;

// Step 1: Direct null (lines 413–415)
if (state.coachSession !== null) {
  state.coachSession = null;
}

// Step 2: .set() restore (lines 418–419)
state.pen.set(snap.pen);
state.pencil.set(snap.pencil);

// Step 3: Stats (lines 422–423)
state.hintsRemaining = snap.hintsRemaining;
state.attemptRecorded = snap.attemptRecorded;

// Step 4: Recompute conflicts (line 426)
state.conflicts = computeConflicts(state.pen);

// Step 5: Clear transient state + timer (lines 429–435)
state.incorrect = new Set();
state.incorrectShownUntil = 0;
state.completionMessage = '';
if (clearIncorrectTimer !== null) {
  clearTimeout(clearIncorrectTimer);
  clearIncorrectTimer = null;
}

// Step 6: Consume snapshot (line 438)
state.undoSnapshot = null;

// Step 7: (implicit — no touch of selected or activeMode)

// Step 8: Emit (lines 440–442)
_emit(action, 'pen', 'pencil', 'conflicts', 'incorrect', 'incorrectShownUntil',
      'completionMessage', 'hintsRemaining', 'attemptRecorded', 'coachSession',
      'undoSnapshot');
```

**Verdict:** ✓ Mutation sequence is exact and in correct order.

#### C.3 Coach Interaction

**Spec (§4.3):** Set `coachSession = null` directly, NOT COACH_END dispatch. Rationale: full pencil restore supersedes any revert formula.

**Code (lines 413–415):**
```js
if (state.coachSession !== null) {
  state.coachSession = null;            // direct null — NOT a COACH_END dispatch
}
```

**Verification:**
- ✓ No dispatch call
- ✓ Full `pencil.set(snap.pencil)` at line 419 follows, restoring to pre-move state
- ✓ emit includes 'coachSession' so coach.js tears down panel/overlay (line 441)

**Verdict:** ✓ Coach interaction correctly implemented per spec.

#### C.4 Incorrect State and Timer

**Spec (§4.4):** Clear (not restore), cancel pending clearIncorrectTimer.

**Code (lines 429–435):**
```js
state.incorrect = new Set();
state.incorrectShownUntil = 0;
state.completionMessage = '';
if (clearIncorrectTimer !== null) {
  clearTimeout(clearIncorrectTimer);
  clearIncorrectTimer = null;
}
```

**Verdict:** ✓ Correct.

#### C.5 Selected and ActiveMode

**Spec (§4.5):** Both preserved (untouched).

**Code:** Neither `state.selected` nor `state.activeMode` are modified in the UNDO case.

**Verdict:** ✓ Correct.

#### C.6 Won-State Policy

**Spec (§4.6):** UNDO is a no-op when won. No recovery possible; user must RESET or NEW_PUZZLE.

**Code (line 406):** `if (state.won === true) break;`

**Test (S66 in state.test.js):** Verified as no-op with no state change, no emit.

**Verdict:** ✓ Correct policy and implementation.

#### C.7 Stats Fields

**Spec (§4.7):**
- hintsRemaining: restored but no-op in practice (HINT never captures)
- attemptRecorded: restored in-memory; stats cookie NOT decremented (no decrement primitive exists)

**Code (lines 422–423):** Both restored.

**Test (S73 in state.test.js):** Verified that attemptRecorded reverts to false and no stats spy fires.

**Verdict:** ✓ Correct and documented behavior.

---

### D. Button State Rules (aspec §5)

#### D.1 RELEVANT_KEYS

**Spec (§5):** numpad.js RELEVANT_KEYS must include 'undoSnapshot' and 'generating'.

**Code (numpad.js lines 12–15):**
```js
const RELEVANT_KEYS = new Set([
  'puzzle', 'selected', 'activeMode', 'hintsRemaining', 'won', 'completionMessage',
  'undoSnapshot', 'generating',
]);
```

**Verdict:** ✓ Both keys present.

#### D.2 _update Logic

**Spec (§5):**
```js
undoBtn.disabled = state.undoSnapshot === null || state.won === true || state.generating === true;
```

**Code (numpad.js lines 221–224):**
```js
const undoBtn = _root.querySelector('#btn-undo');
if (undoBtn) {
  undoBtn.disabled = state.undoSnapshot === null || state.won === true || state.generating === true;
}
```

**Verdict:** ✓ Exact match.

#### D.3 Click Handler

**Spec (§5):**
```js
_root.querySelector('#btn-undo').addEventListener('click', () => {
  const s = _gameState.getState();
  if (s.undoSnapshot === null || s.won || s.generating) return;
  _gameState.dispatch({ type: 'UNDO' });
  announce('Last move undone');   // §8
});
```

**Code (numpad.js lines 128–133):**
```js
_root.querySelector('#btn-undo').addEventListener('click', () => {
  const s = _gameState.getState();
  if (s.undoSnapshot === null || s.won || s.generating) return;
  _gameState.dispatch({ type: 'UNDO' });
  announce('Last move undone');
});
```

**Verdict:** ✓ Exact match.

#### D.4 Toolbar Focus Pattern

**Spec (§5):** Automatic via existing `mousedown` preventDefault loop.

**Code (numpad.js lines 137–139):** Loop runs after _buildNumpad, applies to all buttons including #btn-undo.

**Verdict:** ✓ Correct.

---

### E. Keyboard Shortcut (aspec §6)

**Spec (§6):** Ctrl+Z (Win/Linux) or Cmd+Z (Mac), block before digit-keys, focus guard includes BUTTON, no preventDefault when guarded off.

**Code (keyboard.js lines 32–43):**
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

**Verification:**
- ✓ Block placed before digit-keys block (line 45 onwards)
- ✓ e.ctrlKey || e.metaKey covers both platforms
- ✓ !e.shiftKey and !e.altKey guards (spec rationale: Ctrl+Shift+Z is redo)
- ✓ Focus guard includes 'BUTTON' (line 35)
- ✓ No preventDefault when guarded off (lines 37–39)

**Verdict:** ✓ Spec-correct implementation.

---

### F. HTML / CSS Changes (aspec §7)

#### F.1 Template Structure

**Spec (§7.1):** New row `.numpad-undo-row` with `#btn-undo`, placed between `.numpad-utils` and `.numpad-bottom-row1`.

**Code (numpad.js lines 53–55):**
```html
<div class="numpad-undo-row">
  <button class="btn btn-undo" id="btn-undo" aria-label="Undo last move" disabled>Undo</button>
</div>
```

**Placement:** Follows lines 43–51 (.numpad-utils), precedes lines 56–61 (.numpad-bottom-row1).

**Verdict:** ✓ Correct structure and position.

#### F.2 Button Attributes

**Spec (§7.1):**
- `aria-label="Undo last move"`
- `disabled` attribute in template
- class `btn btn-undo`

**Code (numpad.js line 54):**
```html
<button class="btn btn-undo" id="btn-undo" aria-label="Undo last move" disabled>Undo</button>
```

**Verdict:** ✓ All attributes present.

#### F.3 CSS Rules

**Spec (§7.2):**
```css
.numpad-undo-row {
  width: 100%;
}

.numpad-undo-row .btn-undo {
  width: 100%;
}
```

**Code (controls.css lines 34–40):**
```css
.numpad-undo-row {
  width: 100%;
}

.numpad-undo-row .btn-undo {
  width: 100%;
}
```

**Verdict:** ✓ Exact match.

#### F.4 Theme Inheritance

**Spec (§7.2):** No new theme custom properties; inherits `.btn` and `.btn:disabled`.

**Code:** `.btn-undo` has no additional theme-specific rules; inherits from `.btn` base (lines 43–76).

**Verdict:** ✓ Correct; no theme changes needed.

---

### G. SR Announcement (aspec §8)

**Spec (§8):** Text "Last move undone" on successful undo; keyboard path does not announce.

**Code:**
- ✓ Numpad click handler (numpad.js line 132): `announce('Last move undone')`
- ✓ Keyboard handler (keyboard.js lines 32–43): no announce call

**Verdict:** ✓ Correct.

---

### H. Persistence Interaction (aspec §9)

**Spec (§9):**
- Snapshot NOT persisted (excluded by omission in writer's field list)
- Restored state IS persisted (pen/pencil in emit trigger persistence write)
- No-op UNDO does not emit (no persistence write)

**Code:**
- ✓ undoSnapshot not in persistence writer's field list (per aspec-persistence.md §10.2)
- ✓ UNDO emit includes 'pen' and 'pencil' (state.js line 440), triggering persistence subscriber
- ✓ Guard-blocked UNDO breaks early with no emit (line 407: `break;` with no _emit call)

**Verdict:** ✓ Correct; no changes to persistence writer needed.

---

### I. Emit Keys (aspec §10)

#### I.1 UNDO Emit

**Spec (§10.1):** Full key set = `'pen', 'pencil', 'conflicts', 'incorrect', 'incorrectShownUntil', 'completionMessage', 'hintsRemaining', 'attemptRecorded', 'coachSession', 'undoSnapshot'`

**Code (state.js lines 440–442):**
```js
_emit(action, 'pen', 'pencil', 'conflicts', 'incorrect', 'incorrectShownUntil',
      'completionMessage', 'hintsRemaining', 'attemptRecorded', 'coachSession',
      'undoSnapshot');
```

**Test (S77 in state.test.js lines 1382–1401):** Verified exact match.

**Verdict:** ✓ Exact match.

#### I.2 Move Action Emits

**Spec (§10.2):** PEN_ENTER, PENCIL_TOGGLE (mutating path), ERASE (both mutating paths) each add 'undoSnapshot' to emit.

**Code:**
- ✓ PEN_ENTER (line 340): `'undoSnapshot'` added
- ✓ PENCIL_TOGGLE (line 374): `'pencil', 'undoSnapshot'` emit
- ✓ ERASE pen-branch (line 391): `'undoSnapshot'` added
- ✓ ERASE pencil-branch (line 395): `'undoSnapshot'` added

**Test (S77 in state.test.js lines 1403–1440):** All three paths verified.

**Verdict:** ✓ All move actions emit 'undoSnapshot' on mutation.

#### I.3 Snapshot-Clearing Action Emits

**Spec (§10.3):** PUZZLE_LOADED, NEW_PUZZLE, RESET_PUZZLE, CHANGE_DIFFICULTY each add 'undoSnapshot' to emit.

**Code:**
- ✓ PUZZLE_LOADED (line 237): 'undoSnapshot' in emit
- ✓ NEW_PUZZLE (line 591): 'undoSnapshot' in emit
- ✓ RESET_PUZZLE (line 617): 'undoSnapshot' in emit
- ✓ CHANGE_DIFFICULTY (line 631): 'undoSnapshot' in emit

**Verdict:** ✓ All snapshot-clearing actions emit 'undoSnapshot'.

---

### J. Test Coverage

**Coverage Report (coverage-undo.md):**
- Total passing: 508 (pre-existing 479 + new 29)
- Branch coverage (all files): 91.47%
- UNDO-specific branches: 100% covered (unit + integration)

**Unit Tests (state.test.js S55–S77):** 19 tests
- S55–S59: Snapshot capture in PEN_ENTER, PENCIL_TOGGLE, ERASE
- S60–S61: ERASE branches
- S62–S65: UNDO guards (undoSnapshot, won, generating) and one-level enforcement
- S66–S67: Won-state and generating guards as no-ops
- S68: HINT not touching snapshot
- S69–S71: Coach interaction
- S72–S74: Snapshot clearing by lifecycle actions
- S75–S77: Complex cases (coach+undo, timer cancellation, emit keys)

**Integration Tests (game-flows.test.js GF15–GF19):** 5 tests
- GF15: Button enable/disable lifecycle + SR announce
- GF16: Auto-clear pencil restoration end-to-end (DOM)
- GF17: Coach + Ctrl+Z keyboard
- GF18: Keyboard variants (Cmd+Z, focus guard, post-win)
- GF19: Session-only (restore with no snapshot)

**A11y Test (a11y.test.js A21):** 1 test
- aria-label presence and disabled toggle

**Verdict:** ✓ 100% branch coverage of UNDO-specific code; all functional paths tested.

---

### K. Functional Spec Alignment (fspec-001-v1.md)

**§9.7 (Undo behavior):**
- ✓ One-level only: snapshot cleared on UNDO
- ✓ Available after pen entry, pencil toggle, erase: tested (S55–S61)
- ✓ Not available after hint, check, select: HINT never captures (S68); CHECK never captures (spec review); SELECT_CELL has no capture (code review)
- ✓ Won-state blocks undo: guard at line 406
- ✓ Session-only: initial null, never persisted
- ✓ Button starts disabled: template `disabled` attribute (numpad.js line 54)

**§14.3 (Screen Reader Announcements):**
- ✓ "Last move undone" announcement (numpad.js line 132)

**Verdict:** ✓ All functional spec requirements met.

---

### L. Visual Design Spec Alignment (vspec-001-v1.md)

**§4.5 (Number Pad):**
- ✓ Undo row: full-width single button between utils and Hint/Coach rows

**§5.8 (Undo Button):**
- ✓ Enabled: standard .btn appearance, full width, "Undo" label, aria-label="Undo last move"
- ✓ Disabled: opacity 0.38, cursor: not-allowed
- ✓ Starts disabled (template `disabled` attribute)
- ✓ Grays out immediately after undo (snapshot nulled, _update re-runs)

**§10.5 (Keyboard Navigation):**
- ✓ Ctrl+Z (Win/Linux) or Cmd+Z (Mac) undoes last move
- ✓ Respects disabled conditions (undoSnapshot, won, generating)
- ✓ No effect when focus inside text input or button

**Verdict:** ✓ All visual and keyboard specs met.

---

## QE Observation — Gap 2: `_applyPenEnter` Defensive Code

**Finding (coverage-undo.md §Gap 2):**

The guard `if (!state.puzzle) return false` at line 171 of state.js is unreachable via the public dispatch API. The reasoning:
1. UNDO requires `state.selected !== null` (PEN_ENTER guard at line 309)
2. Selected can only be non-null if a puzzle exists (PUZZLE_LOADED/NEW_PUZZLE/RESET_PUZZLE set selected=null on puzzle load)
3. Thus, a puzzle must exist when selected is non-null
4. The only way to reach `!puzzle` with selected non-null would be direct state mutation outside dispatch — not possible through the public API

**Verdict:**

This is **pre-existing defensive code**, not introduced by Phase 9. The aspec (§4.1) explicitly states: "!state.puzzle is implicitly covered: a snapshot can only exist if a move occurred, which requires a loaded puzzle." The aspec does NOT prescribe this branch.

**Status:** **Non-blocking observation**. The code is harmless (returns false, a valid value), adds no functional impact, and is documented as unreachable in the coverage report. Removal would slightly improve coverage metrics but is not required for sign-off. Future refactoring could clean it up, but current implementation is safe and correct.

---

## Summary of Findings

| Category | Finding | Status |
|----------|---------|--------|
| **Architectural Fidelity** | All snapshot capture, lifecycle, UNDO action, button state, keyboard, HTML/CSS, emit keys match aspec exactly. | ✓ Pass |
| **Functional Spec** | All user-facing behaviors (move-based undo, one-level, session-only, won-block, auto-clear restore, SR announce) match fspec. | ✓ Pass |
| **Visual Design Spec** | Button placement, styling, aria-label, disabled state, keyboard shortcut all match vspec. | ✓ Pass |
| **Test Coverage** | 508 tests passing; 100% branch coverage of undo-specific code; unit, integration, and a11y tests all present. | ✓ Pass |
| **QE Defensive Code** | Pre-existing `!state.puzzle` guard in _applyPenEnter is unreachable via public API. Harmless, well-documented. | ✓ Non-blocking |

---

## Sign-Off

**The Phase 9 (One-Level Undo) implementation is approved for production.**

All architectural, functional, and visual specifications are faithfully implemented. Test coverage is complete and passing. The implementation is production-ready.

The single observation from QE regarding pre-existing defensive code is non-blocking and does not prevent sign-off.

---

**Reviewed by:** Code Review Team  
**Date:** 2026-05-17  
**Approval:** SIGNED OFF
