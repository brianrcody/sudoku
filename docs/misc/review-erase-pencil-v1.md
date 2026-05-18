# Review Report: "Erase All Pencil Marks" Implementation

**Feature ID:** aspec-erase-pencil  
**Reviewer:** Reviewer Agent  
**Date:** 2026-05-17  
**Review Spec Version:** Final (aspec-erase-pencil.md)

---

## Sign-Off

**The implementation faithfully matches the architectural specification across all components.**

All nine spec sections have been systematically verified against the implemented code. Every requirement—from reducer architecture to button state management to test coverage—is implemented exactly as specified. The feature is ready for QE.

### Verification Summary

#### §3 — `ERASE_ALL_PENCIL` Action
- ✓ Case placed immediately after `case 'ERASE'` (line 412 of state.js), before `case 'UNDO'` (line 432)
- ✓ Four guards in correct order: `!state.puzzle`, `state.won === true`, `state.generating === true`, `_hasNoPencil()`
- ✓ `_captureUndoSnapshot()` called before the loop (line 418)
- ✓ 81-cell zeroing loop (lines 420–422)
- ✓ `_emit(action, 'pencil', 'undoSnapshot')` called before coach block (line 424)
- ✓ Coach termination uses `dispatch({ type: 'COACH_END', reason: 'erase' })` (line 427), not direct null

#### §4 — No-Op Guard
- ✓ `_hasNoPencil()` defined as private function (lines 171–176)
- ✓ Guard is the last of the four (line 416)
- ✓ Break with no emit, no capture on no-op (breaks before `_captureUndoSnapshot()`)
- ✓ Prior snapshot survives untouched (verified in test S79)

#### §5 — Snapshot Capture
- ✓ Direct capture (not temporary-then-commit pattern), placed after all guards, before mutation (line 418)
- ✓ Uses existing `_captureUndoSnapshot()` helper unchanged
- ✓ Captures `pen`, `pencil`, `hintsRemaining`, `attemptRecorded` per helper invariant

#### §6 — Coach Termination
- ✓ Uses `dispatch({ type: 'COACH_END', reason: 'erase' })` (line 427)
- ✓ Placed after `_emit` (line 427 after line 424), so coach session change emits separately
- ✓ Deviation from brief explicitly documented in aspec §6.1 is architecturally sound: full pencil restore (UNDO) rationale does not transfer to erase-forward (ERASE_ALL_PENCIL), which must use the erase-action precedent

#### §7 — Emit Keys
- ✓ Mutating path: exactly `_emit(action, 'pencil', 'undoSnapshot')` (line 424)
- ✓ No-op path: emits nothing (guard `break` precedes `_emit`)
- ✓ Follow-on `COACH_END` dispatch produces separate `'changed'` event (verified in test S85)

#### §8 — Button State Rules

**RELEVANT_KEYS:**
- ✓ `'pencil'` added to set (line 14 of numpad.js)
- ✓ Final set: `['puzzle', 'selected', 'activeMode', 'hintsRemaining', 'won', 'completionMessage', 'undoSnapshot', 'generating', 'pencil']` (lines 12–15)

**_update disabled logic:**
- ✓ Block added after Undo button block (lines 241–254)
- ✓ Local pencil scan (lines 243–248) logically identical to reducer `_hasNoPencil()` for UI-side independence
- ✓ Disabled predicate exactly matches spec: `state.generating === true || state.won === true || !state.puzzle || !hasPencil` (lines 249–253)

**Click handler:**
- ✓ Added after `#btn-undo` handler (line 137)
- ✓ Re-guards correctly: `if (s.generating || s.won || !s.puzzle) return;` (line 139)
- ✓ Scans for pencil marks: `for (let i = 0; i < 81; i++) { if (s.pencil[i] !== 0) { hasPencil = true; break; } }` (lines 141–143)
- ✓ Re-guard on hasPencil: `if (!hasPencil) return;` (line 144)
- ✓ Dispatches `{ type: 'ERASE_ALL_PENCIL' }` (line 145)
- ✓ Announces only on real mutation: `announce('All pencil marks erased')` (line 146) called after re-guard returns

**Toolbar focus pattern:**
- ✓ Automatic: existing `mousedown preventDefault` loop (lines 151–153) runs after template injection, covers `#btn-erase-all`

#### §9 — HTML / CSS Changes

**Template (§9.1):**
- ✓ Button id: `btn-erase-all` (line 54)
- ✓ Classes: `btn btn-erase-all` (line 54)
- ✓ aria-label: `"Erase all pencil marks"` (line 55)
- ✓ Visible text: `Erase all pencil` (line 55)
- ✓ Ships `disabled` (line 55)
- ✓ Positioned before `#btn-undo` in reading order (lines 54–56)

**CSS (§9.2):**
- ✓ `.numpad-undo-row` rule: `display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;` (lines 34–38 of controls.css)
- ✓ Old `.numpad-undo-row .btn-undo { width: 100% }` rule deleted
- ✓ No theme custom properties needed; `.btn-erase-all` inherits standard `.btn` and `.btn:disabled` styling
- ✓ No `themes.css` change required

#### §10 — SR Announcement
- ✓ Text: `"All pencil marks erased"` (line 146 of numpad.js)
- ✓ Called via `announce()` from `srLive.js` (imported line 8)
- ✓ Announced only on real mutation (guarded by click-handler re-check before `announce()`)
- ✓ No keyboard path in v1 (no shortcut)

#### §11 — Persistence Interaction
- ✓ No changes to persistence writer required
- ✓ `_emit` includes `'pencil'`, triggering normal debounced write of empty grid
- ✓ `undoSnapshot` not persisted; on refresh Undo and Erase-all both start disabled (correct)
- ✓ No-op emit prevents persistence write (no-op breaks before `_emit`)

#### §12 — Test Coverage

**Unit tests (state.test.js):**
- ✓ S78: Mutating path zeroes all pencil marks, captures snapshot with pre-wipe copy (lines 1447–1473)
- ✓ S79: No-op when all-zero; prior snapshot survives; no emit (lines 1476–1498)
- ✓ S80: Inert before PUZZLE_LOADED; no throw, no emit, undoSnapshot null (lines 1501–1517)
- ✓ S81: No-op when won===true; pencil and snapshot unchanged (lines 1520–1547)
- ✓ S82: No-op when generating===true; pencil unchanged (lines 1550–1571)
- ✓ S83: UNDO restores every pencil mark exactly; undoSnapshot becomes null (lines 1574–1601)
- ✓ S84: Second no-op ERASE_ALL_PENCIL preserves snapshot; UNDO recovers marks (lines 1604–1626)
- ✓ S85: Coach termination; COACH_END dispatched; two separate changed events (lines 1629–1676)
- ✓ S86: Mutating emit is exactly {pencil, undoSnapshot}; no-op emits nothing (lines 1679–1708)

**Integration tests (game-flows.test.js):**
- ✓ GF20: Button lifecycle; disabled at load, enabled after toggle, clears marks, re-disables, announces (lines 858–897)
- ✓ GF21: Erase-all → Undo end-to-end; pencil marks cleared then restored (lines 900–946)
- ✓ GF22: Coach + Erase-all; coach panel removed, pencil cleared (lines 949–1000)

**a11y test (a11y.test.js):**
- ✓ A22: aria-label and visible text correct; disabled at load, enabled after pencil mark, disabled after erase (lines 362–392)

**Coverage:**
- ✓ All reducer guards tested (puzzle, won, generating, _hasNoPencil)
- ✓ Mutating path tested
- ✓ Coach dispatch branch tested
- ✓ Button disabled-predicate branches tested
- ✓ Click-handler re-guard early-returns tested
- ✓ 100% branch coverage requirement satisfied

### Minor Observations (Non-Blocking)

1. **Narrow-viewport label overflow:** The visible text "Erase all pencil" is longer than "Undo" or "Clear". Per aspec §2, the existing `.btn` flex/wrap behavior has been proven in two-line mode by the Mode button. No CSS override needed; standard button flex behavior will handle wrapping on very narrow viewports. A manual smoke test on narrow widths is recommended (aspec §13, step 7) but is not a blocker.

2. **Coach pencil-revert formula:** After `ERASE_ALL_PENCIL` zeros all marks, the follow-on `COACH_END` dispatch invokes `_revertPencil`, which may re-introduce coach-revealed bits (aspec §6.2). This is the existing, accepted behavior for the single-cell `ERASE` path and is inherited unchanged by `ERASE_ALL_PENCIL`. Test GF22 confirms the pencil grid is cleared; per-cell restoration via the coach formula is the expected design. No issue.

3. **Click-handler pattern:** The numpad click handlers follow the established pattern of re-guarding (defensive redundancy with the reducer guards). This is consistent with `#btn-undo` handler (line 131–135) and provides belt-and-suspenders safety. No issue.

---

## Approval

**Status:** APPROVED — Implementation ready for QE

**Approval Date:** 2026-05-17

**Next Steps:** Forward to QE for integration/e2e testing and manual smoke per aspec §13 step 7.

