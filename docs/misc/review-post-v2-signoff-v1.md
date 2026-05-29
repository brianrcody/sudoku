# Review Report — Post-V2 Sign-Off Batch

**Reviewer:** Reviewer subagent (claude-sonnet-4-6)
**Date:** 2026-05-29
**Git range under review:** `8732af5..HEAD`
**Excluded from review:** `docs/misc/v3featureCandidates.md`, `docs/misc/next-session.md`, and the two V3 feature-candidate commits (`f2f431a`, `3e02c45`) — docs-only, out of scope.

**Features reviewed:**
1. Keyboard navigation through given cells (commit `15e0954`)
2. Win-banner color fix in Coffee Shop theme (commit `f654edf`)
3. Coach `PEN_ENTER` mutation gate (commit `be7e23d`)

---

## Overall Verdict

**FULL SIGN-OFF** (as of 2026-05-29 — see Resolution below). The single blocker was a
documentation-only staleness in `fspec-001-v1.md`; the implementation was already correct and
consistent with all updated aspecs. The fspec has now been brought into alignment.

> **Original verdict (pre-resolution):** Conditional sign-off. Two of the three features passed
> cleanly. The keyboard-navigation feature had one blocker: `fspec-001-v1.md` was not updated
> and directly contradicted the implementation in three places.

---

## Resolution (2026-05-29)

**BLOCKER 1 — RESOLVED.** `fspec-001-v1.md` updated by the Orchestrator (fspec is the Product
Director's to own; edits applied with approval). Changes:

- **§4.2** — arrow-nav bullet rewritten: navigation moves exactly one step regardless of given
  status; given cells are selectable but digit input, Clear, and Hint are disabled while a
  given is selected. (Rewrote the full bullet for internal coherence, since the prior text also
  said "adjacent *player* cell.")
- **§5.2 Home row** — now "Focus index 0 (row 1, column 1), regardless of given status."
- **§5.2 no-selection prose** — now "Arrow keys when no cell is selected select index 0 (row 1,
  column 1), consistent with Home."
- **Observation A also applied:** §14.2 `aria-selected` bullet now notes it includes given
  cells, which are keyboard-selectable though not editable.

Verified: no residual "skipped / first non-given / first available player / nearest player"
language remains in `fspec-001-v1.md`. The fspec now matches `aspec-game-state.md`,
`aspec-ui.md`, `aspec-hints.md`, and the implemented code.

Observation B (SS19 precondition assertion) remains open as a non-blocking test-robustness
nicety — not required for sign-off.

---

## BLOCKER 1 — `fspec-001-v1.md` not updated for keyboard navigation through given cells

**Spec violated:** `docs/fspecs/fspec-001-v1.md` §4.2 and §5.2

**What the spec still requires:**
- §4.2: "Given cells are skipped — arrow navigation lands on the nearest player cell in the
  direction of travel."
- §5.2 keyboard table, Home row: "Focus the first non-given cell."
- §5.2 prose below the table: "Arrow keys when no cell is selected select the first available
  player cell in reading order (top-left to bottom-right)."

**What the implementation does (and what the updated aspecs now say):**
- Arrow navigation moves exactly one step and stops on given cells. Digit input, Clear, and
  Hint are disabled while a given cell is selected (enforced in `numpad.js` and `keyboard.js`).
- `SELECT_FIRST_CELL` (Home key) always selects index 0 regardless of whether it is a given.
- `ARROW_NAV` with `selected === null` selects index 0, not the first player cell.

**Conflict is unambiguous.** The fspec is the authoritative source for user-facing behavior.
All three aspec files (`aspec-game-state.md`, `aspec-ui.md`, `aspec-hints.md`) and the code
were updated consistently — only `fspec-001-v1.md` was missed.

**Suggested fix:** Update `docs/fspecs/fspec-001-v1.md` in three places:

1. **§4.2** — replace:
   > "Given cells are skipped — arrow navigation lands on the nearest player cell in the
   > direction of travel."

   with:
   > "Arrow navigation stops on given cells — each keypress moves exactly one step in the
   > pressed direction regardless of whether the destination is a given. Digit input, Clear,
   > and Hint are disabled while a given cell is selected."

2. **§5.2 keyboard table, Home row** — change:
   > "Focus the first non-given cell"

   to:
   > "Focus index 0 (row 1, column 1), regardless of given status."

3. **§5.2 prose, arrow-key no-selection sentence** — change:
   > "Arrow keys when no cell is selected select the first available player cell in reading
   > order (top-left to bottom-right)."

   to:
   > "Arrow keys when no cell is selected select index 0 (row 1, column 1), consistent with
   > Home."

---

## Feature 2 — Win-Banner Color Fix in Coffee Shop Theme: SIGNED OFF

`css/themes.css` `--win` for `body.theme-coffee` is `#a06b1a`. `vspec-001-v1.md` §2.2 Coffee
Shop `--win` row now reads `#a06b1a` with note "Warm amber; replaces forest green."
Implementation and vspec are in exact agreement. No other prescriptive reference to the old
value `#2d6a4f` exists.

---

## Feature 3 — Coach `PEN_ENTER` Mutation Gate: SIGNED OFF

**`aspec-coach-ui.md` §4.1 amendment accuracy:** The 2026-05-28 amendment accurately describes
the implementation. `state.js` line 326 reads
`if (mutated && state.coachSession !== null && !(action.fromHint ?? false))` — identical to the
pseudocode. The "No-op fill case" note correctly identifies all three no-op paths (selected
cell is a given, same digit re-entered, board already won) and correctly describes the
defense-in-depth rationale: UI guards (`keyboard.js` ignores digit keys on givens; `numpad.js`
disables digit buttons) mean this is a reducer-level contract invariant rather than a
UI-reachable path.

**`tspec-coach.md` update accuracy:** SS19 matches the unit test implementation precisely.
Coverage table updates (SS12 description, branch table) are consistent. The CT-R5/CT-CA1 notes
accurately describe the `twoNakedSingles()` motivation.

**`loadFixturePuzzle` fix:** Correctly synthesizes `solution[target] = expected.digit`. The old
alias `solution = givens` was silently producing zero-valued solution entries at target cells,
which made "correct fill" steps dispatch against `solution[target] === 0` and produce error
recaps that only passed because of the pre-fix coach-block bug. The fix is accurate and the
failure mode is correctly described in the 2026-05-28 tspec note.

**`fspec-002-coach.md` non-update evaluation:** The rationale is sound. `fspec-002-coach.md`
§9.1 triggers the recap "when the user fills a coached cell with a pen digit." A no-op
`PEN_ENTER` places no digit — the fspec trigger condition is simply not met. The behavioral
spec remains accurate without amendment. Accepted as a correct judgment call.

One minor qualification: `fspec-002-coach.md` §5.3 ("the user may freely... Enter pen digits in
non-coached cells... None of these are blocked") was written before given cells became
keyboard-selectable. Digit entry is now silently blocked on givens. This is consistent with
existing fspec-001 given-cell semantics (once fspec-001 is updated per Blocker 1) but slightly
strains the §5.3 "none are blocked" language. Not a blocker — §5.3 describes freedom from
coach-specific blocking, not from input constraints that predate coach mode.

---

## Non-Blocking Observations

**Observation A — `fspec-001-v1.md` §14.2 aria-selected gap:** The ARIA section says "the
selected cell has `aria-selected='true'`" without explicitly mentioning given cells. Not
contradictory, but incomplete. Opportunistically address when editing §4.2/§5.2 for Blocker 1
by adding a note that given cells carry `aria-selected` and `aria-readonly="true"`.

**Observation B — SS19 precondition fragility:** The SS19 test asserts that cell 1 is a given in
`nakedSinglePuzzle` based on a comment, with no runtime assertion. If the fixture is ever
changed, the test would silently exercise a different no-op path (same-digit re-entry) without
failing. Low risk given fixture stability, but `expect(nakedSinglePuzzle.givens[1]).to.not.equal(0)`
as a precondition would eliminate the ambiguity.

---

## Sign-Off Status by Feature

| Feature | Verdict |
|---|---|
| Keyboard navigation through given cells (commit `15e0954`) | **SIGNED OFF** — `fspec-001-v1.md` §4.2/§5.2/§14.2 updated 2026-05-29 (see Resolution). |
| Win-banner color fix in Coffee Shop theme (commit `f654edf`) | **SIGNED OFF** |
| Coach `PEN_ENTER` mutation gate (commit `be7e23d`) | **SIGNED OFF** |
