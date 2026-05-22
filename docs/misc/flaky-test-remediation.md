# Flaky Test Remediation Plan

**Engagement:** Diagnostic + strategy for `js/tests/integration/game-flows.test.js` and `worker.test.js`.  
**Date:** 2026-05-22

---

## 1. Root cause diagnosis

### GF6 — "duplicate row entry flags both cells; erasing one clears the conflict" (lines 184–218)

**Confirmed root cause.** The brief's hypothesis is correct, confirmed by `js/game/conflicts.js`. `computeConflicts(board)` scans the full `pen` array, and `PUZZLE_LOADED` copies givens into `pen` (`state.js` lines 223–225). So conflict detection includes givens. The test hardcodes `digit: 5` (lines 206, 208) into two arbitrarily-chosen non-given cells in the first row that has ≥2 free cells (line 201, `a = row[0]; b = row[1]`).

The flaw is a **digit/cell collision with the puzzle's fixed structure**:
- If `5` is already a given anywhere in `a`'s or `b`'s row, column, or box, that given becomes a third conflict participant.
- After erasing `a` (line 215), the a↔b conflict clears, but b-vs-given-5 remains.
- Result: `conflicts.size` is `1` (or higher), not `0`. The reported `=== 3` is consistent with `b` conflicting with a given in two units simultaneously.

The test passes only when, for the puzzle generated that run, neither `a` nor `b` shares a unit with a given 5. That is a probabilistic property of the random puzzle, hence flaky.

**Classification:** *Fixture-collision flakiness* — a hardcoded input value collides with randomized fixture state.

---

### GF19 — "undoSnapshot is null on fresh mount even when persisted pen/pencil are restored" (lines 780–855)

Three hypotheses were offered in the brief. Two are disproven by reading the code.

**Hypothesis (a) — DISPROVEN.** `_applyPenEnter` (`state.js` lines 178–214) does **not** branch on `fromHint` for its mutation decision. `fromHint` only gates the stats side-effect (line 190). For a restored cell where `givens[i]===0`, `pen[i]===0` initially, and `pen[i]!==digit`, the function sets `state.pen[cellIndex] = digit` and returns `true`. So restore PEN_ENTER does mutate and does set `undoSnapshot` via `state.js` line 334.

**Hypothesis (b) — DISPROVEN.** There is no intra-restore race. `window.gameState` is assigned at module load, then the entire restore block runs synchronously: `PUZZLE_LOADED` (line 72) → the PEN_ENTER loop (lines 78–85) → `DESELECT` (line 100) → `RESTORE_SESSION` (lines 103–107). There is no `await` between them. The parent's readiness poll uses `setTimeout` and cannot interleave with synchronous module execution. By the time the poll observes `puzzle !== null`, the PEN_ENTER restore loop has already completed and `undoSnapshot` is already non-null.

**Corrected root cause.** GF19 should **fail deterministically**: every successful restore of a non-empty pen leaves `undoSnapshot` non-null (confirmed — the only `undoSnapshot = null` sites in `state.js` are lines 240/475/623/650/667: `PUZZLE_LOADED`, `UNDO`, `NEW_PUZZLE`, `RESET_PUZZLE`, `CHANGE_DIFFICULTY`; `RESTORE_SESSION` at lines 672–680 does not touch it).

The test **passes falsely most of the time** because iframe2 frequently does not restore from the seeded blob — it generates a fresh puzzle instead. The candidate mechanism:

- iframe1 is still live with its persistence writer attached when the test hand-seeds localStorage (line 815). The debounced `_saveState` (100 ms, `main.js` line 241) may fire after `setItem` and overwrite the hand-crafted blob with iframe1's live state. If that happens, iframe2 reads a different blob or a null blob and falls to the `else` branch (line 109), generating fresh. Fresh generation → no PEN_ENTER → `undoSnapshot` is null → assertion passes.

**The smoking gun:** the test's pen-restoration check is conditional (lines 850–852): `if (restored.puzzle?.id === puzzleId) { expect(...) }`. If iframe2 generated a different puzzle, this guard is skipped silently. A setup that didn't happen passes the test without detection.

**Consequential finding: this is a production bug.** When restore *does* work (the one-in-N failure), `undoSnapshot` is non-null after restore. A user who reloads mid-game can immediately press Undo and revert the restored entry that they made in a previous session — a move that has no business being undoable. **GF19 is failing correctly when it fails.** The test assertion is right; the code is wrong.

**Classification:** *Cross-context setup race* (the seeding/restore handshake between two iframes is not deterministic) compounding a *latent product defect* (restore path leaks `undoSnapshot`). Flakiness masks a real bug.

---

### W5 — RESOLVED (reference)

Confirmed as described. Changing the background tier from `kiddie` to `hard` (`worker.test.js` line 203) makes the foreground `kiddie` request win on wall-clock time in practice. This is a **probabilistic ordering assumption**, not a structural guarantee. Classified as *result-ordering race*. It is a patch, not a cure (see §3).

---

## 2. Flakiness taxonomy

Three distinct classes are present in this suite.

**Class A — Fixture-collision flakiness.**  
*Pattern:* the test hardcodes an input value (a digit, a coordinate) and combines it with a randomly generated fixture. The assertion's truth depends on a relationship between the hardcoded value and the random fixture that the test never constrained.  
*Recognize it when:* you see a literal digit (`digit: 5`) or a positionally-chosen cell (`row[0]`, `findIndex(g===0)`) fed into logic whose outcome depends on the surrounding generated board (conflicts, correctness, peer sets).  
*Instances:* GF6 (definite). Latent risk: GF10, GF16 (see §5).

**Class B — Result-ordering / timing-assumption flakiness.**  
*Pattern:* a test asserts an ordering or timing relationship between two asynchronous events that the system does not contractually guarantee; it holds only probabilistically.  
*Recognize it when:* the test compares the arrival order of concurrent async results, or relies on a real-time `setTimeout` to bound when an effect "should" have happened.  
*Instances:* W5 (patched). Latent risk: GF2 (real 3.5 s wait, lines 97–99, flagged in the file's own header).

**Class C — Cross-context setup race (with self-masking assertions).**  
*Pattern:* the test orchestrates state across two execution contexts (two iframes sharing localStorage) without a deterministic handshake; the key assertion is then guarded by a condition that can be silently false on the "wrong" path, letting a failed setup produce a spurious pass.  
*Recognize it when:* you see a second iframe seeded from a first iframe's storage, a coarse readiness poll (`puzzle !== null`), and `if (...) { expect(...) }` guards that can be skipped.  
*Instances:* GF19 (definite).

---

## 3. Specific fixes

### GF6 — Fix the test (root cause)

Do not hardcode `digit: 5`. After selecting `a` and `b` (lines 195–202), compute the set of digits already present as givens in the row/column/box of both cells, and pick any digit 1–9 not in that union. Use the chosen digit in both PEN_ENTER calls (lines 206, 208). This guarantees the only conflict is the intentional a↔b pair, so erasing `a` yields `conflicts.size === 0` deterministically.

Also strengthen the row-selection loop (line 201): require that the selected row has ≥2 free cells **and** at least one digit is conflict-free across both cells' units; otherwise continue to the next row. The existing `this.skip()` fallback (line 203) handles the degenerate case.

**This is a root-cause fix.** Do not "fix" by loosening the assertion to `conflicts.size <= 1` — that would hide the round-trip semantics the test exists to prove.

---

### GF19 — Fix the code first, then harden the test

The test assertion is correct. The code must change.

**Code fix (root cause) — `state.js`, `RESTORE_SESSION` handler (lines 672–680):**  
Add `state.undoSnapshot = null;` inside the `RESTORE_SESSION` case, and add `'undoSnapshot'` to its `_emit` call. `main.js` always dispatches `RESTORE_SESSION` as the final restore step (line 103), so this guarantees a clean session start. Low blast radius; semantically: "restore finished — no move to undo."

Do not use Option 2 (guarding `PEN_ENTER` on `fromHint`): `fromHint` is also used for hint placement during play, where undo behaviour may be intentional, and conflating restore with hint is error-prone. If a restore-specific path is ever needed, use a distinct `action.restore === true` flag rather than overloading `fromHint`.

**This is a cure, not a patch.** It makes `undoSnapshot === null` true after every restore, which is the documented invariant (`state.js` typedef + test comment lines 842–843), and it fixes the user-facing undo-after-reload bug.

**Test hardening — `game-flows.test.js`, GF19 (lines 780–855):**

1. *Strengthen the readiness poll* (lines 825–833). The current check (`cells === 81 && puzzle !== null`) is true after `PUZZLE_LOADED`, before restore completes. Replace with a condition that proves restore actually happened: poll until `gs2.getState().puzzle?.id === puzzleId && gs2.getState().pen[idx] === digit`. This ensures the assertion only runs after the right blob was restored.

2. *Make the pen-restoration check unconditional* (lines 850–852). Remove the `if (restored.puzzle?.id === puzzleId)` guard; the strengthened poll already guarantees it. A failed restore now times out and fails loudly rather than passing.

3. *Eliminate the iframe1 writer race*. Before seeding the blob (line 815), remove iframe1 from the DOM (`iframe1.remove()`) or dispatch `NEW_PUZZLE` to disarm its persistence writer, so no stale debounced `_saveState` can overwrite the hand-crafted blob before iframe2 loads.

Without the code fix, the hardened test will fail deterministically — correctly exposing the bug. With both changes, it passes for the right reason.

---

### W5 — Convert the patch to a structural fix (lower priority)

The `kiddie` vs `hard` timing skew makes the ordering race unlikely, not impossible. Options:

- If the worker contractually serializes foreground ahead of queued background work, assert that contract via an observable signal (queue position, preemption event) rather than wall-clock arrival order.
- If no such contract exists, reframe the test to assert only what is guaranteed (both results arrive; foreground is not starved beyond some bound), or implement an explicit priority queue in the worker and assert on its state.

No immediate action required, but this should not be considered structurally fixed.

---

## 4. Structural prevention

**Class A (fixture-collision):**
- DO derive every input value from the live fixture. Before entering a digit whose effect depends on the board, compute the constraint set from `givens`/`pen`/`solution` and pick a value that satisfies the test's intent.
- DON'T hardcode digits or assume positionally-chosen cells are "clean." `row[0]`/`row[1]` say nothing about the digit content of their units.
- DO add a precondition check + `this.skip()` when no suitable value exists, rather than proceeding with a colliding one.

**Class B (ordering/timing):**
- DON'T assert ordering of concurrent async results unless the SUT guarantees it and you assert against the guarantee's observable signal.
- DON'T rely on real wall-clock `setTimeout` to bound effects. Where fake timers can't cross iframes, assert on an explicit completion signal or event rather than a fixed delay.
- DO prefer event/promise-based synchronization over fixed sleeps.

**Class C (cross-context setup race) — test infrastructure:**
- DO redefine the readiness-check contract: a poll must wait for the **exact precondition the assertion needs**, not a generic proxy. `puzzle !== null` is too coarse when the test depends on restored content. Build a shared helper, e.g. `waitForRestoredPuzzle(iframe, { puzzleId, idx, digit })`, and require its use for any restore-dependent test.
- DON'T guard the test's primary assertion behind a condition that can be silently false. If a precondition isn't met, the test should fail or skip explicitly — never pass by skipping the check.
- DO isolate localStorage per test. Tear down or detach the seeding iframe's persistence writer before hand-seeding state for a second iframe, so a stray debounced write cannot clobber the fixture.

---

## 5. Audit findings — other tests with latent flakiness risk

Not currently failing, but carrying the same structural patterns.

**GF10 (lines 299–327) — Class A risk.** Picks `cellA=row[0]`, `cellB=row[1]`, then `PENCIL_TOGGLE digit 3` on `cellB` and `PEN_ENTER digit 3` on `cellA`, asserting peer auto-clear. Hardcoded `3` is the same fixture-collision class as GF6. Recommend deriving the digit from the board.

**GF16 (lines 460–530) — Class A risk (mitigated).** Uses `penDigit = solution[penCell]===9 ? 1 : 9` — a wrong-digit heuristic that avoids winning. But if `9` or `1` is a given in `peerCell`'s unit, the undo round-trip can pick up an unintended conflict that perturbs DOM assertions (lines 524–529). Lower risk than GF6 (assertions are about pencil presence, not conflict count), but the digit should be derived to be unit-free.

**The `solution[idx]===9 ? 1 : 9` idiom (e.g., lines 90, 144, 172, 437, 601, 627, 659, 688, 752, 792) — Class A latent.** This guarantees a "wrong" digit (good for avoiding a win) but does **not** guarantee the digit is conflict-free. Any future test that uses this idiom and then asserts on `conflicts` or `incorrect` size is exposed. Current uses are safe (they assert `won`, `undoSnapshot`, or button state), but flag as a known idiom to avoid in tests that touch `conflicts`.

**GF2 (lines 81–100) — Class B, self-flagged.** Real 3.5 s wait for auto-clear. On slow CI this can flake. Recommend an event-based wait on the `incorrect` emit (after `CLEAR_INCORRECT` fires) rather than a fixed sleep.

---

## Implementation checklist

1. `js/game/state.js` — `RESTORE_SESSION` (lines 672–680): add `state.undoSnapshot = null` and add `'undoSnapshot'` to `_emit`. **[Code fix — GF19 root cause / production bug]**
2. `js/tests/integration/game-flows.test.js` — GF6 (lines 184–218): derive conflict-free digit from board; strengthen row-selection guard. **[Test fix — GF6 root cause]**
3. `js/tests/integration/game-flows.test.js` — GF19 (lines 780–855): strengthen readiness poll; remove conditional assertion guard; tear down iframe1 before seeding. **[Test hardening — GF19]**
4. (Optional, lower priority) GF10, GF16: derive digits from board instead of hardcoding. **[Class A preventive]**
5. (Optional, lower priority) GF2: replace fixed-sleep wait with event-based wait. **[Class B preventive]**
6. (Optional, eventual) W5: replace timing-skew patch with structural priority-queue assertion. **[Class B cure]**
