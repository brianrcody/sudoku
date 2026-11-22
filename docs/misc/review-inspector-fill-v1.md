# Review — Inspector fill of unmarked cells + finned-fish `fishDigit` (v1)

**Date:** 2026-11-22
**Branch:** `debug-instrumentation`, uncommitted working tree on top of `3b4a279`
**Scope:** (1) `pencilAtStep` gives baseline-unmarked empty cells the solver's candidates;
(2) Finned X-Wing/Swordfish pattern digit renamed `digit` → `fishDigit` so it no longer
overwrites `step.digit: null`.
**Specs checked:** fspec-005 §5.3, §5.4, §6, §11; aspec-dev-mode (inspect.js API, wiring
table); aspec-solver §7 Step contract; aspec-harder-tiers §3.3, §7, §8; aspec-coach-analyzer
mapper inputs; tspec-dev-mode; tspec-harder-tiers; dev-mode-workflows.md; README. No vspec
touches this change (vspec-005 has no pencil-mark-stepping content).
**Not re-run:** the full suite (Orchestrator reports 2740 passing / 0 failing / 11 pending,
100% branch coverage on the four touched solver/dev files). I ran two read-only probes
against the working tree (results quoted below).

---

## Verdict: Sign-off

The implementation matches fspec-005 §5.4 as amended, the aspec/tspec text matches the
code, and no consumer of a finned step's digit remains on `step.digit`. No blockers.
Observations below are non-blocking.

---

## 1. Fill rule vs fspec-005 §5.4

| fspec-005 §5.4 requirement | Code | Result |
|---|---|---|
| Baseline = marks when the board is first set to a step | `devPanel.js:368-372` snapshots `state.pencil` only when `_basePencil === null` | Match |
| Coach-revealed marks excluded from baseline | `devPanel.js:370` dispatches `COACH_END` before the snapshot; `state.js:952-958` reverts revealed marks | Match |
| Step *n* = baseline minus everything steps 1..*n* rule out (elimination removes candidates; placement clears cell and removes digit from peers) | `inspect.js:174-187` (`_trimPencil`), unchanged logic | Match |
| Unmarked baseline cell, still empty at step *n* → solver's candidates after step *n* | `inspect.js:163-171`: `basePencil[i] === 0 && board[i] === 0` → `candidatesAtStep(baseBoard, steps, upTo)[i]`; `board` is `boardAtStep` at the same `upTo` | Match |
| Marked cell trimmed to nothing stays empty | Condition keys on `basePencil[i]`, not the trimmed value, so a marked cell is never refilled | Match |
| Filled cells (givens, player digits, step placements) have no marks | `board[i] !== 0` skips the fill; `_trimPencil` zeros placed cells | Match |
| Both directions; earlier step brings marks back | Every apply derives from `_basePencil`/`_base` (`devPanel.js:374-378`); candidates at an earlier step are a superset | Match |
| Hand-edited marks while stepped not kept | Same: derivation never reads current marks | Match |
| Restore board returns exact baseline | `devPanel.js:288` dispatches `_basePencil` itself, not a recomputation | Match |
| Same step index for board, pencil and overlay | `devPanel.js:374-378` all use `index` | Match |

Probe on `HARD` with an all-empty baseline at the first elimination step (index 32,
Locked Candidates): every empty cell's pencil equals `candidatesAtStep` exactly and every
filled cell is 0. On the reporting puzzle, step 18 is "WXYZ-Wing — eliminate 3 from r4c9"
and step 19 "Finned X-Wing — eliminate 1 from r1c8", both with `placement === null`.

## 2. Aspec / tspec text vs code

- aspec-dev-mode line 128: signature `pencilAtStep(basePencil, baseBoard, steps, upTo)`
  matches `inspect.js:163`.
- aspec-dev-mode line 170 wiring: `pencilAtStep(_basePencil, _base, steps, n)` matches
  `devPanel.js:378`. Only other caller is `fidelity-sweep.test.js:181`, updated.
- aspec-solver line 161, aspec-harder-tiers line 79 and §7 line 188, and
  aspec-coach-analyzer line 356 all name `fishDigit`; they match `logical.js:22`,
  `finnedFish.js:138` and `analyzer.js:1421,1424`.
- tspec-dev-mode lines 41 and 96 cite IN14d–IN14i and IN14h; those IDs exist in
  `inspect.test.js` with the described content. DP66 (line 57 description, "Restore
  returns the snapshot and the next apply re-snapshots") still describes
  `devPanel.test.js:668-683`.

## 3. Remaining `digit` consumers of finned steps

Searched `js/` and `docs/` (excluding `aspec-001-v1.md`).

- **No technique other than finned fish returns a top-level `digit`.** Every elimination
  result in `js/solver/techniques/*.js` was checked. `digit` keys exist only nested
  (`coloring.js:144` inside `colorChains[]`, `forcingChains.js:103` inside `chain`, chain
  nodes), and the passthrough copies those containers whole, so they never reach
  `step.digit`. `PASSTHROUGH_FIELDS` (`logical.js:19-25`) no longer contains any core
  Step key.
- **Trace consumers keyed on `step.digit !== null`** are now correct for finned steps:
  `inspect.js:42,77,120` (text, place cells, `placement`), `devSession.js:208-210` (the
  console inspector API's `placement`), and `hintProvider.js:51,57`. That last one
  matters beyond dev mode: before the fix, the no-target fallback could return a Finned
  X-Wing step as a hint and place the fish digit in the first elimination cell.
- **`stepCells`**: `fishDigit` is not in `CORE_KEYS` (`inspect.js:25`) or `CELL_KEYS`
  (`inspect.js:19-22`), so `_collectCells` walks it with `isCell = false` and ignores it.
  Correct, and IN14i asserts `cells.place` is empty.
- **Coach**: the analyzer reads `step.digit` only in the Naked/Hidden Single mappers
  (`analyzer.js:292,339`), placement steps that never carry passthrough fields. CoachStep
  `type` comes from rank (`analyzer.js:121`), not `step.digit`. `ui/coach.js:350` keys
  off `step.eliminations[0].digit`. Probe: rank14/rank15 fixtures produce `digits` `[3]`
  / `[6]`, equal to their elimination digits, with correct supporting text.
- **Fixture extractor** `js/tests/fixtures/puzzles/coach/_extract.js` reads only the
  CoachStep (`type`, `rank`, `technique`), not the trace. Coach fixtures (`index.js`
  rank14/15) store `expected.technique/rank/type` only.
- **Session codec / recorder**: CoachStep docs carry `digits`, not trace steps;
  `sessionCodec.js:218,251,260` drops `solveTrace`. Nothing there sees the rename.

## 4. Session fixtures and replay

- `DEV_SET_BOARD` is recorded with its explicit `pencil` array (`sessionCodec.js:579-591`)
  and replay dispatches the recorded value, so it never calls `pencilAtStep`. The two
  `DEV_SET_BOARD` entries in `format-v1-baseline.json` (lines 1532, 1750) replay
  unchanged. The hash pin (`session-fixtures.test.js:21,76`) is unaffected and the file is
  untouched. No session fixture contains `solveTrace`, `Finned`, or `fishDigit`.
- `fidelity-sweep.test.js` builds `DEV_SET_BOARD` live from the seeded RNG and checks
  record/replay self-consistency, not pinned outputs, so the new values are fine.

## 5. Candidate overlay (fspec-005 §6) interaction

While a step is applied, the overlay compares against `_appliedCandidates`, which is the
same `candidatesAtStep(_base, steps, index)` used for the fill. Filled cells therefore
classify as all Agree, which is what an unmarked cell showed before. Probe: zero Missing
and zero Extra bits across the board. Marked cells classify as before. No §6 violation.
See O2 for what happens after the inspector goes stale.

## 6. Test adequacy

New branch in `pencilAtStep` (`inspect.js:168`): (unmarked, empty) → fill; (unmarked,
filled) → given and placed cells; (marked) → trimmed-to-empty cell. IN14h covers all three
on a real trace and checks that the input is untouched. Its `if (elimCell !== trimmed)`
guard is always true on `HARD` (step 32 eliminates from two cells, 38 and 39), so the
assertion does run; see O4. IN14f was correctly narrowed to marked cells. DP66 checks the
devPanel call, including argument order: a swapped or wrong board would produce a
different array. L10b pins the Step contract (`digit === null` on every elimination step)
on the reporting puzzle and pins `fishDigit`; IN14i pins the inspector's classification.

---

## Non-blocking observations

**O1. No test pins the coach finned mapper's digit.** `analyzer.test.js:529-558` asserts
`step.digits` has length 1 but not its value, and `assertSchemaComplete`
(`analyzer.test.js:68-94`) only checks `!== undefined`. Had the `analyzer.js:1421` rename
been missed, `digits` would be `[undefined]` and the supporting text would read
"*undefined*", and the suite would still pass. It is correct today (probe above).
Suggested: in the rank 14/15 extra assertions, add
`expect(step.digits[0]).to.equal(step.eliminations[0].digit)`.

**O2. After the inspector goes stale, the filled candidates become real player marks.**
fspec-005 §5.4 says that after a player change "the board and pencil marks then stay as
they are", so this is per spec. The visible change from before: those cells are no longer
unmarked. With the overlay on, basic candidates come back (`_clearInspection`,
`devPanel.js:422`) and the digits the solver had eliminated show as Missing (underlined)
instead of all Agree. The marks also persist with the game. Worth a line in
dev-mode-workflows.md §3.3 so it doesn't read as an overlay bug.

**O3. Wording that still says only "trim".** The `_applyStep` JSDoc (`devPanel.js:361-366`)
and the tool table in `docs/misc/dev-mode-workflows.md:341` ("trims your pencil marks")
don't mention the fill. README line 85 and workflows §3.3 (lines 131-137) do.

**O4. IN14h's conditional guard** (`inspect.test.js` IN14h, `if (elimCell !== trimmed)`)
is always taken on this fixture, but if `HARD`'s first elimination step ever had a single
target, the main fill assertion on `elimCell` would silently drop (the loop over all cells
would still cover the fill). tspec-harder-tiers line 36 already treats conditionally
asserted tests as a defect class. Consider asserting the precondition
(`expect(steps[e].eliminations.length).to.be.above(1)`) in place of the `if`.

**O5. L10b is not listed in any tspec.** `logical.test.js` L10b has no row in
tspec-harder-tiers or elsewhere; L10 lives only in the historical `tspec-001-v1.md:240`.
A one-line row in tspec-harder-tiers (next to line 36) would record it.

**O6. Stale pre-generation cache entries.** `clientGenProvider.js:228` persists
`solveTrace` to localStorage, so a puzzle cached before this change keeps finned steps with
a non-null `digit`. The only consumer of a stored `solveTrace` is `techniqueProfile` via
`describeGeneration` (`inspect.js:303`), which reads technique names only. The hint
provider and the inspector both re-solve. No action needed; noted for completeness.
