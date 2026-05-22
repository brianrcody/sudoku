# Test Strategy — One-Level Undo
**ID:** tspec-undo
**Status:** Final
**Date:** 2026-05-17
**Author:** QE Strategist
**Loaded by:** QE Test Writer, QE Test Runner.

> **Also load:** `docs/aspecs/aspec-undo.md` — implementation plan; source of branch inventory.
> **Also load:** `docs/fspecs/fspec-001-v1.md` §9.7 — functional spec for undo behavior.

---

## 1. Overview

### Approach

Undo is a pure reducer feature with three thin DOM touchpoints (numpad button, keyboard shortcut, SR announcement). The strategy is **unit-test-first**: every reducer branch introduced by undo is covered in `state.test.js` (S55–S77), where the existing `makeGs`/`loadPuzzle`/`select` helpers and inline fakes give deterministic, fast control over `coachSession`, `generating`, `won`, and timers. Integration tests in `game-flows.test.js` (GF15–GF19) cover only what unit tests cannot: real DOM button enable/disable, the rendered grid after an auto-clear undo, the keyboard handler with synthesized modifier keydowns, and session-only behavior across a fresh mount. One a11y assertion (A21) covers the `aria-label` and `disabled` toggling.

### Rationale

- The `state.js` reducer holds 100% of the conditional logic. Unit-level coverage is exhaustive, isolated, and fast.
- `numpad.js`'s disabled expression is a single boolean OR of three already-unit-tested state fields; its DOM effect is verified once in GF15/A21 rather than re-deriving every combination at integration level.
- `keyboard.js`'s handler depends on `document.activeElement` and real modifier keys — only Playwright/iframe integration can reliably exercise the focus-tag guard and Ctrl vs Cmd.
- No tests duplicate existing coverage (S10–S26 already cover base PEN_ENTER/PENCIL_TOGGLE/ERASE/no-op behavior). Only the **new** snapshot/restore branches are added.

### Test level distribution

| Level | File | Count | IDs |
|---|---|---|---|
| Unit | `js/tests/unit/state.test.js` | 23 | S55–S77 |
| Integration | `js/tests/integration/game-flows.test.js` | 5 | GF15–GF19 |
| A11y | `js/tests/integration/a11y.test.js` | 1 | A21 |
| **Total** | | **29** | |

---

## 2. Test Inventory

### Unit tests — `js/tests/unit/state.test.js`

Append after S54, inside the existing `describe('game/state.js')` or a nested `describe('UNDO')`.

| ID | Name | Covers | Input → Expected |
|---|---|---|---|
| S55 | PEN_ENTER on empty cell sets undoSnapshot (deep copy) | `_applyPenEnter` truthy → `pending` committed; snapshot is a value copy | Load easy, select 1, `PEN_ENTER 3` → `undoSnapshot !== null`; `undoSnapshot.pen` is a distinct `Uint8Array` with pre-move value; mutating `state.pen` does not change `undoSnapshot.pen` |
| S56 | UNDO restores pen/pencil and consumes snapshot | UNDO all guards pass; restore + `undoSnapshot=null` | After S55 setup, `UNDO` → `pen[1]===0`, `undoSnapshot===null`; typed-array object identity preserved (`.set()` used) |
| S57 | UNDO restores auto-cleared peer pencil marks (critical case) | Full `pencil` restore supersedes `_autoClearPencil` | Pencil-mark digit 3 in cells 2, 9, 10 (row/col/box peers of cell 1); select 1, `PEN_ENTER 3` (peers cleared); `UNDO` → all three peers have bit-3 set again |
| S58 | UNDO recomputes conflicts | `state.conflicts = computeConflicts` post-restore | Create duplicate digit producing a conflict via second PEN_ENTER; `UNDO` the second → `conflicts.size===0` |
| S59 | PENCIL_TOGGLE captures snapshot; UNDO reverts the bit | `_captureUndoSnapshot()` called past PENCIL_TOGGLE guards | Select 1, `PENCIL_TOGGLE 5` → `undoSnapshot!==null`; `UNDO` → `pencil[1]===0` |
| S60 | ERASE of pen digit captures + UNDO restores | `ERASE` `pen[cellIdx]!==0` branch | PEN_ENTER 3 in cell 1, ERASE → `undoSnapshot!==null`, `pen[1]===0`; `UNDO` → `pen[1]===3`, conflicts recomputed |
| S61 | ERASE of pencil marks captures + UNDO restores | `ERASE` `pencil[cellIdx]!==0` (pen===0) branch | PENCIL_TOGGLE 4 in cell 1, ERASE → snapshot set; `UNDO` → `pencil[1]` bit-4 set |
| S62 | ERASE on empty cell does not capture or clobber | `ERASE` both-zero no-op path | PEN_ENTER 3 in cell 1 (snapshot A), select empty cell 2, ERASE → `undoSnapshot` still === A; no emit from the empty ERASE |
| S63 | PEN_ENTER same-digit no-op preserves prior snapshot | `_applyPenEnter` returns false → `pending` discarded | PEN_ENTER 3 in cell 1 (real), PEN_ENTER 3 again (same digit no-op) → `undoSnapshot` reflects pre-first-entry; one `UNDO` → `pen[1]===0` |
| S64 | PEN_ENTER given/no-selection does not capture | `_applyPenEnter` returns false on given / `selected===null` | (a) `selected===null` → `PEN_ENTER` breaks, `undoSnapshot===null`; (b) prior real snapshot survives a subsequent given-cell attempt |
| S65 | One-level only: second consecutive UNDO is no-op | UNDO guard `undoSnapshot===null` true branch | Two PEN_ENTERs (cells 1, 2); `UNDO` reverts cell 2 only; second `UNDO` → no change, emit count 0 |
| S66 | UNDO blocked while won | UNDO guard `won===true` true branch | Force `state.won=true` with a snapshot present (see §4 gap note); `UNDO` → board unchanged, `won` still true, emit count 0 |
| S67 | UNDO blocked while generating | UNDO guard `generating===true` true branch | PEN_ENTER (snapshot set), `SET_GENERATING flag:true`, `UNDO` → board unchanged, `undoSnapshot` unchanged, emit count 0 |
| S68 | HINT does not capture or clear snapshot | HINT is not undoable | PEN_ENTER 3 in cell 1 (snapshot A), select empty cell 2, `HINT` → `undoSnapshot` still === A; `UNDO` → reverts PEN_ENTER (pen[1]===0), hint digit retained at cell 2 |
| S69 | attemptRecorded restored on undo of first move | `state.attemptRecorded = snap.attemptRecorded` | First-ever PEN_ENTER flips `attemptRecorded` true; `UNDO` → `attemptRecorded===false`; stats attempt count still 1 (cookie not decremented — documented accepted behavior, asserted explicitly) |
| S70 | hintsRemaining restored on undo (no-op in practice) | `state.hintsRemaining = snap.hintsRemaining` | PEN_ENTER, `UNDO` → `hintsRemaining` equals tier limit (unchanged); asserts the restore line executes without altering value |
| S71 | UNDO ends coach session via direct null | UNDO `coachSession!==null` true branch | Start coach session (COACH_START with synthesized placement result), PEN_ENTER, `UNDO` → `coachSession===null`; `pencil` equals pre-move snapshot (post-auto-reveal); exactly one `'changed'` emit from UNDO carrying `coachSession` and `undoSnapshot` in `changed` |
| S72 | UNDO skips coach block when session null | UNDO `coachSession===null` false branch | PEN_ENTER with no coach session, `UNDO` → no error; `coachSession` stays null |
| S73 | Coach pencil churn does not capture snapshot | COACH_START/COACH_END do not touch undoSnapshot | `COACH_START` then `COACH_END` with no user move → `undoSnapshot===null` |
| S74 | Lifecycle actions clear snapshot and emit key | PUZZLE_LOADED / NEW_PUZZLE / RESET_PUZZLE / CHANGE_DIFFICULTY | For each: PEN_ENTER to set snapshot, dispatch lifecycle action, assert `undoSnapshot===null`, assert emitted `changed` Set contains `'undoSnapshot'`, then `UNDO` is a no-op |
| S75 | UNDO clears incorrect + cancels clearIncorrectTimer | UNDO `clearIncorrectTimer!==null` true branch; incorrect/incorrectShownUntil/completionMessage cleared | On Easy: PEN_ENTER wrong digit, `CHECK` (sets incorrect + schedules timer), PEN_ENTER another move, `UNDO` → `incorrect.size===0`, `incorrectShownUntil===0`, `completionMessage===''`; assert no spurious `CLEAR_INCORRECT` emit after timer interval (timer was cancelled) |
| S76 | UNDO when clearIncorrectTimer is null | UNDO `clearIncorrectTimer===null` false branch | PEN_ENTER, `UNDO` with no prior CHECK → executes cleanly, no error |
| S77 | UNDO emit-key set is exactly §10.1; move emits include undoSnapshot | UNDO `_emit` changed Set; PEN_ENTER/PENCIL_TOGGLE/ERASE emit sets | Capture `changed` on UNDO; assert it equals `{pen,pencil,conflicts,incorrect,incorrectShownUntil,completionMessage,hintsRemaining,attemptRecorded,coachSession,undoSnapshot}`; assert each mutating PEN_ENTER, PENCIL_TOGGLE, pen-ERASE, pencil-ERASE emit includes `'undoSnapshot'` |

### Integration tests — `js/tests/integration/game-flows.test.js`

Append GF15–GF19, following the existing skip-if-no-gameState pattern.

| ID | Name | Covers | Input → Expected |
|---|---|---|---|
| GF15 | Undo button enable/disable + SR announce | `numpad.js` disabled expression, click handler, `announce` | Button `disabled` at load; PEN_ENTER via dispatch → button enabled; click `#btn-undo` → board reverted, button re-disabled; `#sr-live` (after two rAF) contains "Last move undone" |
| GF16 | Auto-clear undo end-to-end (DOM) | Critical case: rendered grid after pencil restore | Pencil-mark several peers (verify pencil DOM present), pen a digit (verify peer pencil DOM removed), click Undo → peer pencil marks reappear in rendered cell DOM |
| GF17 | Coach + Ctrl+Z keyboard undo | keyboard `ctrlKey` path + coach teardown | Open Coach (panel/overlay in DOM), make coached pen entry, synthesize `keydown {key:'z', ctrlKey:true}` on document → coach panel/overlay removed, board reverted |
| GF18 | Keyboard guards: Ctrl/Cmd/focus/won/Shift/Alt | keyboard.js all branches | (a) `metaKey` z → undo dispatched; (b) focus inside a `BUTTON` then Ctrl+Z → no undo; (c) after win, Ctrl+Z → inert, win banner stays; (d) Ctrl+Shift+Z and Ctrl+Alt+Z → not matched; (e) snapshot null → Ctrl+Z no preventDefault, no dispatch; **also:** snapshot present + `SET_GENERATING true` + Ctrl+Z → no dispatch |
| GF19 | Session-only across fresh mount | `undoSnapshot` not persisted; `RESTORE_SESSION` clears it | Remove seeding iframe from DOM before writing localStorage (eliminates debounced-write race). Poll until `puzzle.id === seededId && pen[idx] === seededDigit` (proves restore happened). Assert `undoSnapshot===null`, `#btn-undo` disabled, and pen entry restored — all unconditionally. |

### A11y test — `js/tests/integration/a11y.test.js`

Append A21, following the A13/A15 pattern.

| ID | Name | Covers | Input → Expected |
|---|---|---|---|
| A21 | Undo button aria-label + disabled toggles with undoSnapshot | static `aria-label`, `disabled` reactivity | `#btn-undo` `aria-label === "Undo last move"`; `disabled` true at load; after pen entry `disabled` false; after Undo click `disabled` true again |

---

## 3. Branch Coverage Map

### `js/game/state.js`

| Location | Branch | Test(s) |
|---|---|---|
| `UNDO` `undoSnapshot===null` — true (no-op) | S65 (2nd undo), S74 |
| `UNDO` `undoSnapshot===null` — false (proceed) | S56, S57, S58 … |
| `UNDO` `won===true` — true (no-op) | S66 |
| `UNDO` `won===true` — false | S56 |
| `UNDO` `generating===true` — true (no-op) | S67 |
| `UNDO` `generating===true` — false | S56 |
| `UNDO` `coachSession!==null` — true (null it) | S71 |
| `UNDO` `coachSession!==null` — false (skip) | S72 |
| `UNDO` `clearIncorrectTimer!==null` — true (cancel) | S75 |
| `UNDO` `clearIncorrectTimer!==null` — false (skip) | S76, S56 |
| `PEN_ENTER` `selected===null` — true (break) | S64a |
| `PEN_ENTER` `selected===null` — false | S55 |
| `PEN_ENTER` `if (mutated)` — true (commit pending) | S55 |
| `PEN_ENTER` `if (mutated)` — false (discard) | S63, S64 |
| `_applyPenEnter` `!state.puzzle` — return false | See §4 Gap 2 |
| `_applyPenEnter` given cell — return false | S64b |
| `_applyPenEnter` `state.won` — return false | S66 |
| `_applyPenEnter` `prevValue===digit` — return false | S63 |
| `_applyPenEnter` `_isBoardFull()` path — return true | S66 natural-win path |
| `_applyPenEnter` normal success — return true | S55 |
| `PENCIL_TOGGLE` guards → break (before capture) | S64-style + existing S23 |
| `PENCIL_TOGGLE` capture reached | S59 |
| `ERASE` `pen[cellIdx]!==0` — true | S60 |
| `ERASE` `pen[cellIdx]!==0` — false | S61, S62 |
| `ERASE` `pencil[cellIdx]!==0` — true | S61 |
| `ERASE` `pencil[cellIdx]!==0` — false (both 0, no-op) | S62 |
| `PUZZLE_LOADED` `undoSnapshot=null` + emit | S74 |
| `NEW_PUZZLE` `undoSnapshot=null` + emit | S74 |
| `RESET_PUZZLE` `undoSnapshot=null` + emit | S74 |
| `CHANGE_DIFFICULTY` `undoSnapshot=null` + emit | S74 |
| `RESTORE_SESSION` `undoSnapshot=null` + emit | GF19 |

### `js/ui/numpad.js`

| Branch | Test |
|---|---|
| `undoBtn` exists — true | GF15, A21 |
| `disabled` via `undoSnapshot===null` — true | GF15/A21 (load) |
| `disabled` via `won===true` — true | GF18c |
| `disabled` via `generating===true` — true | GF18 (extended case — see §4 Gap 1) |
| All false → enabled | GF15/A21 (after pen entry) |
| Click handler early-return guard | GF18b/c |
| Click handler dispatch + announce | GF15 |

### `js/ui/keyboard.js`

| Branch | Test |
|---|---|
| key `z`/`Z` && ctrl && !shift && !alt — match | GF17 |
| meta — match | GF18a |
| shiftKey — not matched | GF18d |
| altKey — not matched | GF18d |
| focus tag in form control/BUTTON → return | GF18b |
| `undoSnapshot===null` → return (no preventDefault) | GF18e |
| `won===true` → return | GF18c |
| `generating===true` → return | GF18 extended case (see §4 Gap 1) |
| valid → preventDefault + dispatch | GF17, GF18a |

---

## 4. Gaps and Risks

**Gap 1 — `generating` disabled branch at DOM level.** GF15–GF19 as written don't toggle `generating` while a snapshot exists. The Test Writer must add explicit assertions in GF18 (or a sub-case of GF15): dispatch `SET_GENERATING flag:true` after a snapshot exists, assert `#btn-undo.disabled === true` (numpad) and synthesize Ctrl+Z, assert no dispatch (keyboard). Without these, the `generating===true` branches in `numpad.js` and `keyboard.js` are only covered at unit level (S67), not at the DOM layer, and c8 will flag uncovered branches in those files.

**Gap 2 — `_applyPenEnter` `!state.puzzle` return false.** Dispatching `PEN_ENTER` normally requires `selected!==null`, and selection in the normal flow implies a loaded puzzle. This branch may be unreachable through the public API. The Test Writer should investigate whether it can be triggered (e.g., by nulling puzzle after select). If unreachable via dispatch, document it as dead-defensive code and flag to the Reviewer for potential removal rather than writing a contrived test.

**Gap 3 — `ERASE` post-mutation `coachSession!==null` → COACH_END.** This is pre-existing behavior co-located with the new snapshot capture. Verify that S60/S61 have no active coach session (covering the false branch), and that an existing coach+erase test (e.g., in `coach/session.test.js`) still covers the true branch. If no such test exists, add a small assertion.

**Gap 4 — S75 timer-cancellation verification.** Verifying that a cancelled `setTimeout` does not fire is inherently timing-dependent. Options: (a) spy on `clearTimeout` to assert it was called; (b) wait a bounded interval past `CHECK_HIGHLIGHT_MS` and assert no second `CLEAR_INCORRECT` emit arrived. Recommend (a) if the test environment allows spying on globals; it is synchronous and non-flaky. Document the approach in the test.

**Gap 5 — `window.gameState` exposure.** All GF and A21 tests skip silently when `iframe.contentWindow.gameState` is absent. The Test Writer must verify this exposure exists for the new tests, or fail explicitly (not skip) for the undo tests so coverage gaps surface as failures rather than silence.

**Gap 6 — GF16 pencil DOM structure.** The auto-clear undo test depends on the rendered pencil-mark DOM. The Test Writer must inspect `js/ui/grid.js`'s pencil rendering to determine the correct selector (e.g., `.cell-pencil`, `[data-digit]`, etc.) before writing assertions. Do not assume structure.

**Gap 7 — S66 won+snapshot interaction.** When a real win occurs via the final `PEN_ENTER`, the chain is: `_applyPenEnter` returns true → `state.undoSnapshot = pending` → chain to `ON_COMPLETION_EVALUATE` → `won=true`. So a snapshot exists momentarily while `won===true`. The cleanest test for the won-guard is the **forced** variant: manually set `state.won=true` with a snapshot present via `getState()` mutation (if the test harness allows), then dispatch UNDO. Use the natural-win path as a secondary sanity check only.
