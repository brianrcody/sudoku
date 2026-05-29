# Test Strategy — Coach Mode
**ID:** tspec-coach
**Status:** Draft
**Date:** 2026-05-21
**Author:** QE Strategist
**Loaded by:** QE Test Writer, QE Test Runner.

> **Also load:** `docs/aspecs/aspec-coach-analyzer.md` — sealed `CoachStep` schema; branch source for analyzer.
> **Also load:** `docs/aspecs/aspec-coach-ui.md` — reducer slice, action catalogue, cross-action obligations; branch source for `state.js` coach logic.
> **Also load:** `docs/fspecs/fspec-002-coach.md` — user-facing behavior (button states, lifecycle, recap content, a11y).

> **Update 2026-05-28:** Added SS19 (no-op `PEN_ENTER` fires no coach block) for the `mutated` gate added to `aspec-coach-ui.md` §4.1. Reworked the recap/cross-action integration fixtures: `loadFixturePuzzle` now synthesizes `solution[target]` from `expected.digit`, and CT-R5/CT-CA1 use a dedicated `twoNakedSingles()` board. Root cause: the analyzer fixtures carry no `solution` field (risk R5), so `loadFixturePuzzle` had aliased `solution = givens`, silently turning several "correct fill" steps into digit-0 no-ops that only passed because of the pre-fix coach-block bug.

---

## 1. Overview

### Approach

Coach Mode splits cleanly into three test surfaces:

1. **Analyzer (`js/coach/analyzer.js`)** — a pure, DOM-free function. Tests are deterministic unit tests in `js/tests/unit/coach/analyzer.test.js`, driven by per-rank fixture boards. The analyzer is the largest source of branchy code in the feature (15 per-technique mappers + pencil-intersection + null-case handling + pre-flight error gate), and is the primary target for the 100%-branch-coverage goal.
2. **Reducer slice (`js/game/state.js`)** — coach actions (`COACH_START`, `COACH_END`, `COACH_FILL_RECAP`, `COACH_FOCUS_COACHED_CELL`, `COACH_FOCUS_OFF`, `COACH_NO_TECHNIQUE`) and the cross-action obligations on `PEN_ENTER`, `PENCIL_TOGGLE`, `ERASE`, `HINT`, `NEW_PUZZLE`, `RESET_PUZZLE`, `CHANGE_DIFFICULTY`, `PUZZLE_LOADED`, `ON_COMPLETION_EVALUATE`. Tested in isolation in `js/tests/unit/coach/session.test.js` with stub analyzer payloads — no DOM, no analyzer dependency.
3. **UI (`js/ui/coach.js`, `js/ui/coachOverlay.js`)** — DOM, timers, focus tracking, live-region announcements, context-aware error toast. Tested via Playwright-style iframe integration in `js/tests/integration/coach.test.js`. Per the analyzer/UI spec, these modules are integration-only — unit-testing them yields mostly mock-interaction assertions.

### Rationale

- The analyzer is the only Coach module that benefits meaningfully from exhaustive branch coverage. Every per-technique mapper has at least one variant (pointing/claiming, row/col orientation, short/long chain, Rule 2/Rule 4) and the analyzer's correctness is load-bearing for the entire feature. The existing test file already establishes the helper machinery (`techniqueTests`, `assertSchemaComplete`, `pencilPlayerState`); the gap is **fixture availability**, not test scaffolding.
- The reducer slice is small, synchronous, and emitter-instrumented. Unit tests against the real reducer (no mock) give fast, deterministic coverage of every action handler and cross-action branch.
- The UI module owns timer logic (recap 2.5s, error toast 5s), the `_lastSessionHadErrorRecap` context flag, the keyboard-shortcut focus-tag guard, and the cross-module CustomEvent for panel↔overlay coordination. None of these can be meaningfully unit-tested without mocking the DOM, and the existing iframe integration harness is already capable. Branch coverage for `coach.js` and `coachOverlay.js` is best-effort.
- **Honesty about fixtures:** the analyzer test file currently has rank 4–15 `techniqueTests` blocks commented out. Almost every analyzer P1 item below depends on rank-clean fixtures being collected.

### Test level distribution

| Level | File | New count | IDs |
|---|---|---|---|
| Unit | `js/tests/unit/coach/analyzer.test.js` | 41 | AN1–AN41 |
| Unit | `js/tests/unit/coach/session.test.js` | 18 | SS1–SS18 |
| Integration | `js/tests/integration/coach.test.js` | 18 | CT-NT3, CT-NT4, CT-NT5, CT-W1, CT-SR1, CT-SR2, CT-HK1, CT-HP1, CT-PR3, CT-R6, CT-R7, CT-R8, CT-A11y3–CT-A11y6, CT-PERF1, CT-PL1 |
| **Total** | | **77** | |

### Coverage target

100% branch coverage for `js/coach/analyzer.js` and the coach-related branches in `js/game/state.js` (the `COACH_*` cases plus the conditional hooks in `PEN_ENTER`, `PENCIL_TOGGLE`, `ERASE`, `ERASE_ALL_PENCIL`, `HINT`, `NEW_PUZZLE`, `RESET_PUZZLE`, `CHANGE_DIFFICULTY`, `PUZZLE_LOADED`, `ON_COMPLETION_EVALUATE`, `UNDO`). Integration tests for `js/ui/coach.js` and `js/ui/coachOverlay.js` are best-effort — DOM rendering and SVG primitives are not instrumented for branch coverage in this project's c8 config.

---

## 2. What the existing tests already cover

### `js/tests/unit/coach/analyzer.test.js` — current coverage

| Coverage area | Tested? | Notes |
|---|---|---|
| Rank 1 (Naked Single) happy path + conflict block + autoReveal pencil-intersect | Yes | Solid — 3 sub-tests via `techniqueTests` |
| Rank 2 (Hidden Single) happy path + conflict block + autoReveal pencil-intersect | Yes | But only one *unit type* is exercised (whichever the fixture happens to fire — row/col/box branch coverage incomplete) |
| Rank 3 (Locked Candidates) happy path + conflict block + autoReveal pencil-intersect | Yes | But only one variant fires (pointing vs claiming) — branch coverage incomplete |
| Rank 4 regression (one-elim-digit, digits=[] bug) | Yes | Active and passing |
| Rank 6 regression (one-elim-digit, digits=[] bug) | Yes | Active and passing |
| Ranks 4, 5 (AN1–AN2) | Yes | Active 2026-05-21; 3 sub-tests each via `techniqueTests` |
| Rank 8 X-Wing row-locked + column-locked (AN6–AN8) | Yes | Active 2026-05-21; orientation divergence asserted |
| Rank 9 Swordfish (AN9) | Yes | Active 2026-05-21; AN10 col-orientation deferred (rank09Col pending) |
| Ranks 10, 11 (AN11, AN13) | Yes | Active 2026-05-21 |
| Rank 12 Simple Coloring Rule 2 + Rule 4 (AN14–AN15) | Yes | Active 2026-05-21; Rule 2 vs Rule 4 branch asserted structurally |
| Rank 13 Multi-Coloring (AN16) | Yes | Active 2026-05-21 |
| Rank 14 XY-Chain short + long (AN17–AN18) | Yes | Active 2026-05-21; long-chain elision conditional on DFS finding L > 6 |
| Ranks 6, 7 (AN4–AN5) | **No** | Fixtures still pending (rank06 invalid placeholder, rank07 construction failed) |
| Rank 15 (AN19) | **No** | Fixture pending (rank15 export is invalid placeholder) |
| Rank 5 one-elim-cell regression (AN3) | **No** | Fixture pending |
| No-technique: complete | Yes | |
| No-technique: inconsistent | Yes | |
| No-technique: non-conflicting wrong pen entry | Yes | Synthetic puzzle |
| No-technique: conflicted entry blocks immediately | Yes | Synthetic puzzle |
| Purity (two calls deeply equal, no mutation of inputs) | Yes | |
| Schema completeness (rank 1, rank 8 if fires) | Partial | Only 2 ranks asserted; AN27 (all ranks) not yet implemented |
| Long-chain elision (rank 14) — conditional | Yes | Both cross-cutting (defensive) and AN18 (dedicated `techniqueTests` block) |
| Forcing Chain always-acknowledged (rank 15) — conditional | Yes (defensive) | Test gates on whether technique actually fires |
| autoReveal.required false for 1–2, true for ≥3 | Yes | |
| autoReveal.cells candidates derive from initialCandidates | Yes (ranks 1–14) | All active fixtures via techniqueTests test 3 |
| Pencil intersection: no-pencil / null / undefined equivalence | Yes | |
| Pencil intersection: keep-candidate with full bits | Yes (rank 3) | |
| Pencil intersection: technique suppressed when all elim cleared | Yes (rank 3) | |
| Pencil intersection: technique fires when partial clear | Yes (rank 3) | |
| Pencil intersection: pencil[i]=0 leaves candidates unchanged | Yes | |

### `js/tests/unit/coach/session.test.js` — current coverage

| Coverage area | Tested? | Notes |
|---|---|---|
| `COACH_START` no-technique no-op | Yes | |
| `COACH_START` rank-1 (no auto-reveal) populates slice; coachRevealedBits all-zero | Yes | |
| `COACH_START` rank-4 with autoReveal adds pencil bits; tracks revealed bits | Yes | |
| `COACH_START` pencilSnapshot byte-for-byte | Yes | |
| `COACH_START` coachedCells union | Yes | |
| `COACH_START` focusedCoachedCell init (coached/non-coached) | Yes | |
| `COACH_END` no-op when null | Yes | |
| `COACH_END` slice→null + pencil revert | Yes | |
| `COACH_END` Example B (user adds during session) | Yes | |
| `COACH_END` Example C (user toggles off coach bit) | Yes | |
| `COACH_END` Example D (rank-1 no-touch) | Yes | |
| `COACH_FILL_RECAP` normal/error variants | Yes | |
| `COACH_FILL_RECAP` slice non-null after recap | Yes | |
| `COACH_FILL_RECAP` subsequent `COACH_END` no-op | Yes | |
| `COACH_FILL_RECAP` elim variant: zero bits, pencil unchanged, recap='elim' | Yes | |
| `COACH_FILL_RECAP` elim emits coachSession but not pencil | Yes | |
| `COACH_FOCUS_COACHED_CELL` sets focus / no-op outside set / no-op during recap | Yes | |
| `COACH_FOCUS_OFF` clears focus / no-op already null | Yes | |
| `PEN_ENTER` coached correct/wrong/elim/non-coached/fromHint | Yes | |
| `ERASE` ends session | Yes | |
| `HINT` ends session, no recap | Yes | |
| `NEW_PUZZLE` / `RESET_PUZZLE` / `PUZZLE_LOADED` clear slice | Yes | |
| `CHANGE_DIFFICULTY` ends + pencil reverts / no-op without session | Yes | |
| Elimination completion: full clear → elim recap; partial → no recap | Yes (Locked Candidates) | |
| Elimination completion: Hidden Pair `elimTarget=[]` fallback | Yes | |
| Win-during-recap (via direct `COACH_END {reason:'won'}`) | Yes (proxy) | SS16 also exercises the real `ON_COMPLETION_EVALUATE` chain via `_applyPenEnter` |
| `COACH_START` guarded when `puzzle === null` | Yes | SS1 |
| `COACH_START` guarded when `won === true` | Yes | SS2 |
| `COACH_START` no-technique change-key emit | Yes | SS3 |
| `COACH_START` over active session: defensive pencil revert before new snapshot | Yes | SS4 |
| `COACH_START` placement → `eliminationTargets === null` | Yes | SS5 |
| `COACH_START` elimination with `roles.elimTarget = []` builds from `eliminations` | Yes | SS6 |
| `COACH_FILL_RECAP` no-op when `coachSession === null` | Yes | SS7 |
| `COACH_FILL_RECAP` no-op when already in recap | Yes | SS8, SS9 |
| `COACH_NO_TECHNIQUE` emits `coachSession` change-key | Yes | SS10 |
| `PEN_ENTER` coach block runs after `_applyPenEnter` mutation | Yes | SS11 |
| `PEN_ENTER` no coach block when session null | Yes | SS12 |
| `PEN_ENTER` no coach block when fill is a no-op (`mutated === false`) | Yes | SS19 |
| `PENCIL_TOGGLE` no-op when session null | Yes | SS15 |
| `PENCIL_TOGGLE` no-op when placement session (no `eliminationTargets`) | Yes | SS13 |
| `PENCIL_TOGGLE` no-op when recap active | Yes | SS14 |
| `ON_COMPLETION_EVALUATE` natural win path (direct `_applyPenEnter` chain) | Yes | SS16 |
| `ERASE_ALL_PENCIL` ends session + pencil revert | Yes | SS18 |

### `js/tests/integration/coach.test.js` — current coverage

| Coverage area | Tested? | Notes |
|---|---|---|
| CT-S1–CT-S3 smoke (rank 1 + rank 4 classes, coachRevealedBits zero for rank 1) | Yes | |
| CT-P1–CT-P5 panel open/close, overlay visible, em rendering, technique name | Yes | |
| CT-R1–CT-R5 recap correct/wrong fill, elim no-recap, 2.5s dismiss, Coach-during-recap | Yes | `loadFixturePuzzle` now synthesizes `solution[target] = expected.digit` (analyzer fixtures carry no `solution`), so "correct fill" places a real digit and the recap classifies correctly. CT-R5 uses a dedicated two-naked-single board (`twoNakedSingles()`) so the second Coach press starts a genuine fresh session — see 2026-05-28 note |
| CT-NT1 Coach disabled on win + click no-op | Yes | Rewritten 2026-05-22: Coach button is disabled once won; clicking is a no-op (no recap, coachSession null) |
| CT-NT2 toast auto-dismiss after 5 s | Removed | Premise obsolete — Coach is disabled on win, so the "already solved" toast is unreachable. 5 s error-toast timing remains covered by CT-NT3 |
| CT-NT3 non-conflicting wrong digit → error toast | Yes | |
| CT-NT4 genuinely inconsistent board → contradiction toast | Yes | |
| CT-NT5 context-aware error toast after prior error recap | Yes | Fresh iframe per R8 |
| CT-PR1, CT-PR2 pencil revert / user mark preserved | Yes | |
| CT-CA1–CT-CA4 Erase / New Puzzle / Reset / Difficulty | Yes | CT-CA1 uses `twoNakedSingles()`: its scratch fill consumes the first single while the second keeps the session alive, so it erases a real digit (rank01's missing `solution` previously made the fill a silent no-op) |
| CT-EC1–CT-EC4 elim completion + pencil retention + pre-cleared candidates | Yes | |
| CT-KB1, CT-KB2 keyboard `C` with body focus / BUTTON focus (both trigger) | Yes | |
| CT-HK1 keyboard `C` — INPUT / SELECT / TEXTAREA focus-tag guards | Yes | |
| CT-A11y1, CT-A11y2 aria-describedby on coached / not on non-coached | Yes | |
| CT-A11y3 Coach button aria-label reverts to "Coach" after session end | Yes | |
| CT-A11y4 panel `role="region"` and `aria-label="Coach explanation"` | Yes | |
| CT-A11y5 recap `role="status"` and `aria-live="polite"` | Yes | |
| CT-A11y6 live region announces technique name + cell count | Yes | |
| CT-PERF1 Coach press → highlights visible within 200 ms | Yes | Uses rank03 fixture |
| CT-W1 win during coach fill: win banner shows, recap hidden | Yes | Uses natural generated puzzle (rank01 has no solution field — see R5 note) |
| CT-SR1 second Coach press resets session, COACH_END between COACH_STARTs | Yes | |
| CT-SR2 Coach press while error toast showing clears timer, fresh analysis fires | Yes | |
| CT-HP1 Hint with panel open closes session + panel | Yes | |

---

## 3. Test inventory for additional tests

Test IDs use prefixes: **AN** = analyzer unit, **SS** = session/reducer unit, **CT-*** = coach integration.

### 3.1 Analyzer unit tests — `js/tests/unit/coach/analyzer.test.js`

Test cases below are all blocked or partially blocked on fixture availability. See §5 for fixture requirements. The Test Writer should uncomment the existing rank N `techniqueTests` blocks (currently commented out) as fixtures become available; the AN entries below extend those with additional branch-coverage cases.

| ID | Description | Type | Covers | Input conditions | Expected output | Priority |
|---|---|---|---|---|---|---|
| AN1 | Rank 4 Naked Pair happy path + conflict + pencil-intersect | unit | Rank-4 mapper branches; `digits.length === 2` path | Load `rank04` fixture; call `analyze(puzzle, playerStateOf(fixture))` | `technique === 'Naked Pair'`; `digits.length === 2`; `roles.cause.length === 2`; `unit !== null`; arrows include exactly 1 bezier-arc + ≥1 dashed-arrow; `roles.elimTarget.length > 0`; schema complete | P1 |
| AN2 | Rank 5 Hidden Pair happy path + conflict + pencil-intersect | unit | Rank-5 mapper; `roles.elimTarget = []` path; `arrows = []` | Load `rank05` fixture | `technique === 'Hidden Pair'`; `digits.length === 2`; `roles.cause.length === 2`; `roles.elimTarget` deep-equals `[]`; `arrows` deep-equals `[]`; `unit !== null` | P1 |
| AN3 | Rank 5 Hidden Pair regression — one-elim-cell | unit | Pair-cell derivation when one cause cell has zero eliminations | Load `rank05OneElimCell` fixture | `digits.length === 2`; `roles.cause.length === 2`; `supportingText` does not include `'undefined'`; schema complete | P1 |
| AN4 | Rank 6 Naked Triple happy path + conflict + pencil-intersect | unit | Rank-6 mapper; `digits.length === 3`; 2 bezier-arc arrows for adjacent pairs | Load `rank06` fixture | `digits.length === 3`; `roles.cause.length === 3`; arrows include exactly 2 bezier-arc + ≥1 dashed-arrow; `unit !== null` | P1 |
| AN5 | Rank 7 Hidden Triple happy path + conflict + pencil-intersect | unit | Rank-7 mapper; `roles.elimTarget = []`; `arrows = []` | Load `rank07` fixture | `digits.length === 3`; `roles.cause.length === 3`; `roles.elimTarget` deep-equals `[]`; `arrows` deep-equals `[]` | P1 |
| AN6 | Rank 8 X-Wing happy path + conflict + pencil-intersect | unit | Rank-8 mapper; 4 corners; connector-chain arrow | Load `rank08` fixture | `roles.cause.length === 4`; arrows include exactly 1 connector-chain (`points.length === 4`) + ≥1 dashed-arrow | P1 |
| AN7 | Rank 8 X-Wing — first orientation supporting text | unit | Orientation branch in X-Wing mapper | Load `rank08` fixture; inspect cause cells to determine actual orientation | `supportingText` contains the correct orientation-specific phrasing per `aspec-coach-analyzer.md` §7.8 | P1 |
| AN8 | Rank 8 X-Wing — opposite orientation | unit | Second orientation branch in X-Wing mapper | Load `rank08Transpose` fixture with the opposite orientation | `supportingText` differs from AN7; contains the alternate row/column labels | P1 |
| AN9 | Rank 9 Swordfish happy path + conflict + pencil-intersect | unit | Rank-9 mapper | Load `rank09` fixture | `digits.length === 1`; `roles.cause.length > 0`; arrows include exactly 1 connector-chain with `points.length === 4` | P1 |
| AN10 | Rank 9 Swordfish — row-locked vs column-locked | unit | Orientation branch in Swordfish | Provide `rank09Row` and `rank09Col` fixtures | Different `supportingText` strings; one says "three rows is locked to these three columns", the other "three columns is locked to these three rows" | P1 |
| AN11 | Rank 10 Jellyfish happy path + conflict + pencil-intersect | unit | Rank-10 mapper | Load `rank10` fixture | `digits.length === 1`; arrows include exactly 1 connector-chain with `points.length === 4` | P1 |
| AN12 | Rank 10 Jellyfish — row-locked vs column-locked | unit | Orientation branch in Jellyfish | Provide both orientations | Different `supportingText` strings | P1 |
| AN13 | Rank 11 XY-Wing happy path + conflict + pencil-intersect | unit | Rank-11 mapper; hinge-first ordering | Load `rank11` fixture | `roles.cause.length === 3`; `roles.cause[0]` is the hinge cell (verifiable via candidate-set: hinge has `{X,Y}`, wings split); arrows: 2 chain-edge (strong:true) + ≥2 dashed-arrow per elim target | P1 |
| AN14 | Rank 12 Simple Coloring — Rule 2 variant | unit | `isRule2` branch in Simple Coloring mapper | Load `rank12` fixture where elim targets fall inside the chain | `supportingText` contains "Two same-color cells see each other — that group can't be"; `roles.scA.length > 0`; `roles.scB.length > 0`; `roles.cause` deep-equals `[]` | P1 |
| AN15 | Rank 12 Simple Coloring — Rule 4 variant | unit | `!isRule2` branch | Load `rank12Rule4` fixture with elim targets outside the chain | `supportingText` contains "Any cell that sees one cell of each color can't be" | P1 |
| AN16 | Rank 13 Multi-Coloring happy path + conflict + pencil-intersect | unit | Rank-13 mapper | Load `rank13` fixture | `roles.cause` deep-equals `[]`; `roles.scA.length > 0`; `roles.scB.length > 0`; arrows all `chain-edge`; `supportingText` contains "Two separate chains for" | P1 |
| AN17 | Rank 14 XY-Chain — short-chain branch (L ≤ 6) | unit | `!isLong` branch | Load `rank14Short` fixture | `complexity.acknowledged === false`; `roles.cause.length === L` (all chain cells); arrows are all `chain-edge` (strong:false); `complexity.note === null` | P1 |
| AN18 | Rank 14 XY-Chain — long-chain branch (L > 6) | unit | `isLong` branch — elision | Load `rank14Long` fixture (must produce L > 6) | `complexity.acknowledged === true`; `roles.cause.length === 2`; `arrows.length === 1`; `arrows[0].style === 'dashed-arrow'`; `complexity.note` is non-empty string | P1 |
| AN19 | Rank 15 Forcing Chain happy path + conflict + pencil-intersect | unit | Rank-15 mapper; always-acknowledged | Load `rank15` fixture | `complexity.acknowledged === true` *unconditionally*; `complexity.note` is the spec-defined note string; arrows are all `chain-edge`; each arrow has `strong` boolean defined | P1 |
| AN20 | Rank 3 Locked Candidates — pointing variant (row line) | unit | Pointing branch with cause cells sharing a box and a row | Load `rank03Pointing` fixture | `supportingText` contains `"in this box is confined to this *row*"`; `roles.cause` are all in the same box and same row | P1 |
| AN21 | Rank 3 Locked Candidates — pointing variant (column line) | unit | Pointing branch with cause cells sharing a box and a column | Load `rank03PointingCol` fixture | `supportingText` contains `"in this box is confined to this *column*"` | P1 |
| AN22 | Rank 3 Locked Candidates — claiming variant (row → box) | unit | Claiming branch via row | Load `rank03ClaimingRow` fixture | `supportingText` contains `"in this *row* only appears within this box"` | P1 |
| AN23 | Rank 3 Locked Candidates — claiming variant (column → box) | unit | Claiming branch via column | Load `rank03ClaimingCol` fixture | `supportingText` contains `"in this *column* only appears within this box"` | P1 |
| AN24 | Rank 2 Hidden Single — row-hiding | unit | Unit-identification first iteration (slot 0 = row) | Load a fixture where the hidden single is in a row | `step.unit.type === 'row'`; `supportingText` contains "in this *row*"; `roles.unitMember.length === 8` | P1 |
| AN25 | Rank 2 Hidden Single — column-hiding | unit | Unit-identification second iteration (slot 1 = col) | Load a fixture where row check fails, column check succeeds | `step.unit.type === 'col'`; `supportingText` contains the col-unit phrasing (see R2 for exact string caveat) | P1 |
| AN26 | Rank 2 Hidden Single — box-hiding | unit | Unit-identification third iteration (slot 2 = box) | Load a fixture where only box check succeeds | `step.unit.type === 'box'`; `supportingText` contains "in this *box*" | P1 |
| AN27 | Schema completeness — every rank | unit | `assertSchemaComplete` against every fixture | Loop `[rank01, rank02, …, rank15, rank14Long]` and call `analyze` on each | For each step that is a `CoachStep`: all schema fields defined, no `undefined`s | P2 |
| AN28 | Per-rank fixture: analyzer returns rank N, not a lower rank | unit | Fixture validity guard — detects fixture drift | For each rank N fixture, call `analyze` and assert `step.rank === N` | `step.rank === N` for every fixture; any mismatch throws a hard error (not `this.skip()`) | P1 |
| AN29 | `eliminations` is a fresh array copy, not a shared reference | unit | Driver pseudocode `eliminations: [...step.eliminations]` | Call `analyze`, mutate the returned `eliminations` array, call `analyze` again | Second call returns identical `eliminations` (mutation did not propagate) | P3 |
| AN30 | `autoReveal.cells` sorted ascending by cellIndex | unit | `[...all].sort((a,b)=>a-b)` in `buildAutoReveal` | Any rank ≥ 3 fixture with multiple referenced cells | `autoReveal.cells.map(c => c.cellIndex)` is monotonically increasing | P2 |
| AN31 | Pencil intersection on rank 4+ technique suppresses correctly | unit | Per-technique suppression beyond rank 3 | Rank-4 fixture: clear all eliminated digits from pencil for elim target cells; call `analyze` | Result is either a different technique or `NoTechniqueResult`; `Naked Pair` does not fire | P2 |
| AN32 | Pencil intersection on rank 8 X-Wing | unit | X-Wing pencil-intersect path | Rank-8 fixture: clear digit D from all elim target cells in pencil | X-Wing does not fire | P2 |
| AN33 | `canonicalise` strips parenthetical suffix | unit | Parenthetical-strip branch in `canonicalise` | Construct a solver step with `technique: 'Locked Candidates (pointing)'` (if achievable via test fixture) | Result `technique === 'Locked Candidates'` | P3 (see R12) |
| AN34 | Working-board exclusion of conflict-flagged cells | unit | `buildWorkingBoard` `conflicts.has(i)` branch | Player state with `conflicts.size > 0` containing a cell with a correct digit | Analyzer returns `{reason:'error'}` (pre-flight guard fires first; correct-cell exclusion is a defense-in-depth detail) | P3 |
| AN35 | Pre-flight error gate fires before solver | unit | `conflicts.size > 0` true branch fires before `solveLogically` | Player state with `conflicts = new Set([0])`; pen[0] = any digit | Result `{type:'no-technique', reason:'error'}` regardless of board solvability | P2 |
| AN36 | Non-conflicting wrong pen entry: detection at any cell position | unit | For-loop covers all 81 cells including the last | Construct a puzzle where pen[40] is wrong (no conflict); then separately where pen[80] is wrong | Both return `{reason:'error'}` | P2 |
| AN37 | Wrong-pen check skips given cells | unit | `if (puzzle.givens[i] !== 0) continue` branch | A given cell where pen matches the given digit (should not trigger error) | Analyzer proceeds to solver normally | P3 |
| AN38 | Wrong-pen check skips empty pen cells | unit | `if (playerState.pen[i] === 0) continue` branch | Standard empty player state on any fixture | Analyzer proceeds to solver | P2 |
| AN39 | `autoReveal.cells` candidates equal pencil-intersected `candidates[i]` (general) | unit | `buildAutoReveal` reads from intersected candidates array | Rank-4 fixture with explicit pencil that restricts a referenced cell | `autoReveal.cells[i].candidates === initialCandidates[i] & pencil[i]` for the restricted cell | P1 |
| AN40 | `complexity.endpoints` always non-null for ranks 14 & 15 | unit | `complexity.endpoints` populated in both short and long branches | `rank14Short`, `rank15` | `complexity.endpoints !== null`; `endpoints.length === 2` | P2 |
| AN41 | Performance: `analyze` completes under 50ms on every fixture | unit | Performance budget (spec: "well under 10ms"; test uses a loose 50ms to avoid CI flakiness) | For each rank fixture, measure `performance.now()` around the `analyze()` call | All calls under 50ms | P3 |

### 3.2 Reducer/session unit tests — `js/tests/unit/coach/session.test.js`

These tests append to the existing file using the same `stubStats`, `stubHintProvider`, and helper stubs already defined.

| ID | Description | Type | Covers | Input conditions | Expected output | Priority |
|---|---|---|---|---|---|---|
| SS1 | `COACH_START` guarded when `puzzle === null` | unit | `state.puzzle === null` break branch | `createState()` with no `PUZZLE_LOADED`; dispatch `COACH_START` with `nakedSingleStep()` | `coachSession === null`; capture emits and assert no `'coachSession'` emit fires | P1 |
| SS2 | `COACH_START` guarded when `won === true` | unit | `state.won === true` break branch | Load puzzle; achieve win state (via `ON_COMPLETION_EVALUATE` or direct fill of last cell); then dispatch `COACH_START` | `coachSession === null`; no `'coachSession'` emit fires | P1 |
| SS3 | `COACH_START` no-technique emits `coachSession` change-key (informational) | unit | `result.type === 'no-technique'` branch's emit | Load puzzle; dispatch `COACH_START` with `{type:'no-technique', reason:'complete'}` | `coachSession === null`; a `'changed'` event fires with `changed.has('coachSession') === true` | P2 |
| SS4 | `COACH_START` over an active session reverts pencil first (defensive path) | unit | `if (state.coachSession !== null)` defensive branch in `COACH_START` | Start a rank-4 session with auto-reveal that adds bits to cell 5. Without dispatching `COACH_END`, dispatch a second `COACH_START` with a rank-1 step. | First session's pencil-revert happens before second session's snapshot is taken; cell 5's bits return to pre-first-session value; second session slice is populated with fresh snapshot | P1 |
| SS5 | `COACH_START` placement technique → `eliminationTargets === null` | unit | `result.type === 'elimination'` false branch | Dispatch `COACH_START` with `nakedSingleStep()` | `coachSession.eliminationTargets === null` | P1 |
| SS6 | `COACH_START` elimination with `roles.elimTarget = []` builds from `eliminations` | unit | Hidden Pair / Hidden Triple branch in eliminationTargets construction | Dispatch `COACH_START` with a Hidden Pair step (`elimTarget: []`, `eliminations: [{10,3},{11,3},{11,7}]`) | `eliminationTargets.get(10) === (1 << 2)`; `eliminationTargets.get(11) === (1 << 2) | (1 << 6)` | P2 |
| SS7 | `COACH_FILL_RECAP` no-op when `coachSession === null` | unit | `if (state.coachSession === null) break` | No session active; dispatch `COACH_FILL_RECAP {variant:'normal'}` | No state change; capture emits and assert no `'coachSession'` emit fires | P1 |
| SS8 | `COACH_FILL_RECAP` no-op when already in recap (normal/error) | unit | `if (state.coachSession.recap !== null) break` | Start session; dispatch `COACH_FILL_RECAP {variant:'normal'}` (enters recap); then dispatch `COACH_FILL_RECAP {variant:'error'}` | `recap` remains `'normal'`; second dispatch produces no additional `'coachSession'` emit | P1 |
| SS9 | `COACH_FILL_RECAP` no-op when already in recap (elim) | unit | Same guard for elim variant | Start elimination session; dispatch `COACH_FILL_RECAP {variant:'normal'}`; then `COACH_FILL_RECAP {variant:'elim'}` | `recap` remains `'normal'`; second dispatch no-op | P2 |
| SS10 | `COACH_NO_TECHNIQUE` emits `coachSession` change-key | unit | Reducer informational emit | Dispatch `COACH_NO_TECHNIQUE {reason:'inconsistent'}` | `coachSession` remains `null`; `'changed'` event fires with `changed.has('coachSession') === true` and `action.reason === 'inconsistent'` | P2 |
| SS11 | `PEN_ENTER` coach block runs AFTER `_applyPenEnter` mutation | unit | Ordering: coach block reads post-mutation `state.pen` | Start placement session at cell 0; dispatch `PEN_ENTER {digit:5}` (correct) | `state.pen[0] === 5` AND `state.coachSession.recap === 'normal'` both true after the dispatch | P2 |
| SS12 | `PEN_ENTER` no coach block when `coachSession === null` at entry | unit | `if (mutated && state.coachSession !== null && !action.fromHint)` — `coachSession` false branch | Load puzzle; no session; dispatch `PEN_ENTER {digit:5}` | No `COACH_END` / `COACH_FILL_RECAP` dispatches; standard pen mutation only | P1 |
| SS19 | `PEN_ENTER` no coach block when the fill is a no-op (`mutated === false`) during an active session | unit | `if (mutated && …)` — `mutated` false branch (given cell / same-digit / won places nothing) | Start a placement session (target cell 0); `SELECT_CELL` a given cell (e.g. cell 1); dispatch `PEN_ENTER {digit:3}` | `_applyPenEnter` returns false (no mutation); session unchanged (`coachSession !== null`, `recap === null`); no `COACH_END` / `COACH_FILL_RECAP` dispatched | P1 |
| SS13 | `PENCIL_TOGGLE` coach hook no-op when `eliminationTargets === null` (placement session) | unit | `eliminationTargets !== null` false branch | Start a Naked Single session (`eliminationTargets: null`); dispatch `PENCIL_TOGGLE` on any cell | No `COACH_FILL_RECAP` dispatched | P1 |
| SS14 | `PENCIL_TOGGLE` coach hook no-op when `recap !== null` | unit | `recap === null` false branch | Start elim session; dispatch `COACH_FILL_RECAP {variant:'elim'}` (enters recap); dispatch `PENCIL_TOGGLE` | No further `COACH_FILL_RECAP` dispatch | P1 |
| SS15 | `PENCIL_TOGGLE` coach hook no-op when `coachSession === null` | unit | `coachSession !== null` false branch | No session; dispatch `PENCIL_TOGGLE` | No coach effect; no coach-related emit | P1 |
| SS16 | `ON_COMPLETION_EVALUATE` natural win path: `won && winHandled && coachSession !== null` → `COACH_END {reason:'won'}` | unit | Real win chain via `_applyPenEnter` (existing test only proxies via direct `COACH_END`) | Construct a complete puzzle (80 givens, cell 0 empty, solution[0]=5); start placement session at cell 0; dispatch `PEN_ENTER {digit:5}` | `state.won === true`; `coachSession === null`; `COACH_END {reason:'won'}` fired (verify via emit-capture). **Note:** `COACH_FILL_RECAP` does NOT fire in the win path — `ON_COMPLETION_EVALUATE` is dispatched inside `_applyPenEnter` before PEN_ENTER's own coach block executes, so `COACH_END` preempts it. | P1 |
| SS17 | `UNDO` clears coachSession and reverts pencil | unit | `case 'UNDO'` coach hook (cross-feature dependency with tspec-undo) | Start rank-4 session (auto-reveal); dispatch a pen entry to create undo snapshot; dispatch `UNDO` | `coachSession === null`; pencil reverted | P3 (deferred to tspec-undo S71) |
| SS18 | `ERASE_ALL_PENCIL` ends session | unit | `case 'ERASE_ALL_PENCIL'` coach hook | Start any session; dispatch `ERASE_ALL_PENCIL` | `coachSession === null`; pencil reverted; emit includes `'coachSession'` | P1 |

### 3.3 Coach integration tests — `js/tests/integration/coach.test.js`

These tests follow the existing `iframe` / `loadIframe` / `wait` pattern in the same file.

| ID | Description | Type | Covers | Input conditions | Expected output | Priority |
|---|---|---|---|---|---|---|
| CT-NT3 | No-technique: non-conflicting wrong digit shows error toast | integration | `COACH_NO_TECHNIQUE {reason:'error'}` + `_showErrorToast('error')` path | Load `rank01` fixture; pen a wrong digit into an empty cell that shares no unit peers with the same digit (so no conflict fires). Press Coach. | Recap element visible with `.error` class; line-1 text equals `"The board has an error. Use Check or Erase to fix it before coaching."`; auto-dismisses after 5s; `coachSession` remains null throughout | P1 |
| CT-NT4 | No-technique: genuinely inconsistent board shows contradiction toast | integration | `_showErrorToast('inconsistent')` path | Load `noTechniqueInconsistent` fixture (stuck board, no wrong digits) | Recap visible with `.error` class; line-1 text equals `"The board has a contradiction. Use Erase to fix it."` | P1 |
| CT-NT5 | Context-aware error toast after error recap | integration | `_lastSessionHadErrorRecap` flag → `useContextMessage` branch | Load `rank01`. Press Coach. Select coached target cell. Pen a *wrong* digit → error recap fires (`_lastSessionHadErrorRecap = true`). Wait 2.6s for recap dismiss. Without correcting the wrong digit, press Coach again. | Recap visible; line-1 contains `"That suggestion didn't work out. A mistaken pencil erasure elsewhere on the board may have led the coach astray. Try using Erase All Pencil and asking the coach again."` | P1 |
| CT-W1 | Win during coach fill: win banner shows, recap does NOT | integration | fspec §11.3 + state.js `ON_COMPLETION_EVALUATE` coach-collapse | Construct a board with exactly one empty cell whose Naked Single completes the puzzle. Press Coach. Pen the correct digit. | Win banner visible; `#coach-recap` is NOT visible; `coachSession === null` | P1 |
| CT-SR1 | Coach pressed second time during active session: session resets, fresh analysis | integration | `coach.js` `_onCoachPressed` `state.coachSession !== null` branch → dispatches `COACH_END` then runs `analyze` again | Load `rank01`. Press Coach (session A). Without making any move, press Coach again. | After second press: `coachSession` is active (fresh session); `recap` is null; no recap visible; a `COACH_END` emit fired between the two `COACH_START` emits (verify via emit capture) | P1 |
| CT-SR2 | Coach pressed while error toast is showing: toast dismisses immediately and fresh analysis runs | integration | `_errorTimer !== null` branch in `_onCoachPressed` | Solve puzzle fully. Press Coach → error toast fires. Without waiting, press Coach again. | Toast hides (`.visible` removed); a new no-technique or session response fires; toast re-shows if still no-technique | P2 |
| CT-HK1 | Keyboard `C` — focus-tag guards for INPUT, SELECT, TEXTAREA | integration | Keydown handler `tag` check for remaining 3 form-control types | Programmatically create an `<input>` element inside the iframe and focus it. Dispatch `keydown {key:'c'}`. Repeat for `<select>` and `<textarea>`. | `coachSession` remains `null` after each dispatch | P2 |
| CT-HP1 | Hint button ending a session with explanation panel open | integration | Hint cross-action while panel is open; no recap per fspec §11.1 | Load `rank01`. Press Coach. `SELECT_CELL` on the coached target (panel opens). Click Hint button. | `coachSession === null`; panel closed; overlay hidden; recap NOT visible | P2 |
| CT-PR3 | Pencil revert: toggle-off of a coach-revealed bit restores cleanly | integration | DOM end of `aspec-coach-ui.md` §5.4 Example C | Load `rank04` (has auto-reveal). Switch to Pencil mode. Identify a cell with `.pencil-mark.coach-reveal`. Click that mark to toggle it off. Then dispatch `COACH_END {reason:'session-reset'}`. | The toggled-off bit is absent (pencil restored to pre-session snapshot, which did not contain that bit) | P2 |
| CT-R6 | Hidden Single recap detail line uses correct unit-label phrasing | integration | `_composeRecapDetail` for `Hidden Single` branch | Load `rank02`. Press Coach. Select the target cell. Pen the correct digit. | Recap line-2 contains `"Hidden Single in"` followed by `"row N"` / `"column N"` / `"box N"` and `"was the only position for that digit."` per fspec §9.2 / aspec-ui §6.11 | P1 |
| CT-R7 | Elim recap detail line for unit-scoped technique (Naked Pair) | integration | `_composeElimRecapDetail` `step.unit !== null` branch | Load `rank04`. Press Coach. Switch to pencil mode. Toggle off all eliminated digit candidates from all elim target cells. After elim recap appears. | Line-2 text contains the technique name (`"Naked Pair"`), the unit label (`"in row N"` / `"column N"` / `"box N"`), the digit text (`"digit D"`), and the count text (`"removed from N cells"` or `"removed from 1 cell"`) | P1 |
| CT-R8 | Elim recap detail line for non-unit technique (X-Wing, `unit: null`) | integration | `_composeElimRecapDetail` `step.unit === null` branch (`"the grid"` fallback) | Load `rank08` (X-Wing has `unit: null`). Press Coach. Trigger elim recap by clearing eliminations from pencil. | Line-2 text uses `"the grid"` substring OR the more verbose technique-specific format. QE Test Writer: verify exact string by running the analyzer once and asserting against the actual produced string. | P2 |
| CT-A11y3 | Coach button aria-label reverts to "Coach" after session end | integration | `_renderButton` `active=false` branch | Press Coach (aria-label becomes `"Coach (active)"`). End session via Erase. | `coachBtn(iframe).getAttribute('aria-label') === 'Coach'` | P1 |
| CT-A11y4 | Panel element has `role="region"` and `aria-label="Coach explanation"` | integration | aspec-coach-ui §12.2 static panel structure | Press Coach; select coached cell to open panel; query `.coach-panel` | `role === 'region'`; `aria-label === 'Coach explanation'` | P1 |
| CT-A11y5 | Recap element has `role="status"` and `aria-live="polite"` | integration | aspec-coach-ui §12.7 static HTML attribute | Inspect `#coach-recap` at iframe load (before pressing anything) | `role === 'status'`; `aria-live === 'polite'` | P1 |
| CT-A11y6 | Live region announces technique name + cell count on COACH_START | integration | `coach.js` `announce()` call in `_onCoachPressed` | Load `rank01`. Capture `#sr-live` text content after pressing Coach (wait 50ms for flush). | `#sr-live` text content contains `"Coach: Naked Single identified."` and `"cells highlighted"` | P1 |
| CT-PERF1 | Coach press → highlights visible within 200ms (UX budget) | integration | End-to-end latency: analyzer + reducer + grid render | Load `rank04` (more complex board). Record `performance.now()` before click; poll for first cell with `.coached-cause` class. | Time delta < 200ms | P3 |
| CT-PL1 | PUZZLE_LOADED via persistence restore clears any in-memory session | integration | aspec-coach-ui §4.9 restore path | Start a coach session; then trigger an iframe reload (the persistence path calls `PUZZLE_LOADED` on restore). | After reload: `coachSession === null`; coach button aria-label is `"Coach"`; recap not visible | P3 |

---

## 4. Coverage map

### `js/coach/analyzer.js` — branch-by-branch

| Branch | Closed by |
|---|---|
| `conflicts.size > 0` true | AN35; existing "conflicted entry" test |
| `conflicts.size > 0` false | Every fixture's happy path |
| `puzzle.givens[i] !== 0 continue` | AN37 |
| `playerState.pen[i] === 0 continue` | AN38 |
| `pen[i] !== solution[i]` true | Existing "non-conflicting wrong pen" test; AN36 |
| `playerState.pencil != null` true | Existing pencil-intersection tests + AN39 |
| `playerState.pencil != null` false | Existing no-pencil tests |
| `pencil[i] !== 0` true | Existing "keep candidate" test + AN39 |
| `pencil[i] !== 0` false | Existing "pencil[i]=0" test |
| `trace.length === 0` true | No-technique complete + inconsistent tests |
| `trace.length === 0` false | Every happy path |
| `buildNullStep`: `allFilled` true | No-technique complete |
| `buildNullStep`: `allFilled` false | No-technique inconsistent |
| `buildAutoReveal`: `roles.target !== null` true | Ranks 1, 2 |
| `buildAutoReveal`: `roles.target !== null` false | Ranks 3+ |
| `canonicalise` parenthetical strip | AN33 (P3) |
| Mapper dispatch — all 15 techniques | AN1–AN19 |
| Hidden Single — row hiding | AN24 |
| Hidden Single — col hiding | AN25 |
| Hidden Single — box hiding | AN26 |
| Hidden Single — col/row/box arrow generation branches | AN24/AN25/AN26 collectively |
| Locked Candidates — pointing/row | AN20 |
| Locked Candidates — pointing/col | AN21 |
| Locked Candidates — claiming/row | AN22 |
| Locked Candidates — claiming/col | AN23 |
| X-Wing — row-locked orientation | AN7 or AN8 (one covers each) |
| X-Wing — column-locked orientation | AN7 or AN8 |
| Swordfish — `rowLocked` true | AN10 |
| Swordfish — `rowLocked` false | AN10 |
| Jellyfish — `rowLocked` true / false | AN12 |
| Simple Coloring — `isRule2` true | AN14 |
| Simple Coloring — `isRule2` false | AN15 |
| XY-Chain — `isLong` true (elision) | AN18 |
| XY-Chain — `isLong` false (full chain) | AN17 |
| Forcing Chain — always-acknowledged | AN19 |
| Naked Pair / Triple digits derivation | AN1, AN4 (regression tests cover digits=[] case) |
| Hidden Pair / Triple `elimTarget=[]` | AN2, AN5 |

### `js/game/state.js` (coach-related branches)

| Branch | Closed by |
|---|---|
| `COACH_START` `puzzle === null` true | SS1 |
| `COACH_START` `won === true` true | SS2 |
| `COACH_START` `result.type === 'no-technique'` true | Existing + SS3 |
| `COACH_START` `result.type === 'no-technique'` false | Existing rank-1, rank-4 tests |
| `COACH_START` `state.coachSession !== null` defensive revert | SS4 |
| `COACH_START` `autoReveal.required` true | Existing rank-4 test |
| `COACH_START` `autoReveal.required` false | Existing rank-1 test |
| `COACH_START` `result.type === 'elimination'` true | Existing elim tests + SS6 |
| `COACH_START` `result.type === 'elimination'` false | SS5 |
| `COACH_START` `roles.elimTarget.length > 0` true | Existing Locked Candidates test |
| `COACH_START` `roles.elimTarget.length > 0` false | Existing Hidden Pair test; SS6 |
| `COACH_START` `selected !== null && coachedCells.has(selected)` true/false | Existing focus-init tests |
| `COACH_END` `coachSession === null` break | Existing |
| `COACH_END` `coachSession !== null` | Existing |
| `COACH_FILL_RECAP` `coachSession === null` break | SS7 |
| `COACH_FILL_RECAP` `recap !== null` break | SS8, SS9 |
| `COACH_FILL_RECAP` `variant === 'elim'` true | Existing |
| `COACH_FILL_RECAP` `variant === 'elim'` false | Existing |
| `COACH_FOCUS_COACHED_CELL` `coachSession === null` break | Covered by guard-assertion in SS10 or existing tests |
| `COACH_FOCUS_COACHED_CELL` `recap !== null` break | Existing |
| `COACH_FOCUS_COACHED_CELL` `!coachedCells.has(index)` break | Existing |
| `COACH_FOCUS_OFF` guards | Existing |
| `COACH_NO_TECHNIQUE` emit | SS10 |
| `PEN_ENTER` `mutated && coachSession !== null && !fromHint` true | Existing + SS11 |
| `PEN_ENTER` coach block false (no mutation — given/same-digit/won) | SS19 |
| `PEN_ENTER` coach block false (no session) | SS12 |
| `PEN_ENTER` coach block false (fromHint) | Existing |
| `PEN_ENTER` `isCoached` false | Existing |
| `PEN_ENTER` `techType === 'elimination'` true | Existing |
| `PEN_ENTER` placement correct vs wrong | Existing |
| `PENCIL_TOGGLE` all 3 guards true | Existing "all cleared" test |
| `PENCIL_TOGGLE` `coachSession === null` false | SS15 |
| `PENCIL_TOGGLE` `eliminationTargets === null` false | SS13 |
| `PENCIL_TOGGLE` `recap === null` false | SS14 |
| `PENCIL_TOGGLE` `allCleared` false (partial) | Existing |
| `ERASE` `coachSession !== null` | Existing |
| `ERASE_ALL_PENCIL` `coachSession !== null` | SS18 |
| `HINT` `coachSession !== null` | Existing |
| `NEW_PUZZLE` / `RESET_PUZZLE` / `PUZZLE_LOADED` set null | Existing |
| `CHANGE_DIFFICULTY` `coachSession !== null` true/false | Existing |
| `ON_COMPLETION_EVALUATE` `won && winHandled && coachSession !== null` true | SS16 + CT-W1 |
| `UNDO` coach branch | tspec-undo S71 (cross-feature, already planned) |

### `js/ui/coach.js` (best-effort, integration-only)

| Branch | Closed by |
|---|---|
| `_onCoachPressed` `!puzzle || won` guard | Existing CT-S1 (implicit); CT-W1 (partial) |
| `_onCoachPressed` `coachSession !== null` reset | CT-SR1 |
| `_onCoachPressed` `_errorTimer !== null` reset | CT-SR2 |
| `_onCoachPressed` `result.type === 'no-technique'` | Existing CT-NT1 |
| `_onCoachPressed` happy path | Existing CT-S1 |
| Keydown handler tag guard — INPUT / SELECT / TEXTAREA | CT-HK1 |
| `_renderButton` `active` true / false | Existing CT-S1 + CT-A11y3 |
| `_renderPanel` `focused` true / false | Existing CT-P1, CT-P3 |
| `_renderRecap` `session.recap !== null` | Existing CT-R1 |
| `_showErrorToast` `useContextMessage` true | CT-NT5 |
| `_showErrorToast` `useContextMessage` false (reason=error) | CT-NT3 |
| `_showErrorToast` `reason === 'complete'` | Existing CT-NT1 |
| `_showErrorToast` `reason === 'inconsistent'` | CT-NT4 |
| `_showRecap` `variant === 'elim'` / `'normal'` / `'error'` | Existing CT-R1, CT-R2, CT-EC1 |
| `_composeRecapDetail` Naked Single branch | Existing CT-R1 |
| `_composeRecapDetail` Hidden Single branch | CT-R6 |
| `_composeElimRecapDetail` `roles.elimTarget.length > 0` | Existing CT-EC1 + CT-R7 |
| `_composeElimRecapDetail` `roles.elimTarget.length === 0` (Hidden Pair fallback) | CT-R7 extension (extend when rank05 fixture lands) |
| `_composeElimRecapDetail` `step.unit !== null` / `null` | CT-R7 / CT-R8 |
| `_trackFocus` coached / non-coached / null | Existing CT-P1, CT-P3, CT-P4 |

### `js/ui/coachOverlay.js` (best-effort)

| Branch | Closed by |
|---|---|
| `coach:panel-opened` listener | Existing CT-P1 |
| `coach:panel-closed` listener | Existing CT-P3 |
| `coachSession === null` defensive hide | Existing CT-CA1 (Erase ends session) |
| Per-arrow style switch (all 6 styles) | Implicit via per-technique smoke tests; extend CT-S2 to count SVG elements by style |

---

## 5. Fixture requirements

Almost all P1 analyzer tests are blocked on rank-clean fixtures. The fixture file at `js/tests/fixtures/puzzles/coach/index.js` declares all rank variables but many are placeholders or unverified. Update `docs/misc/coach-fixture-tracker.md` as fixtures are added.

| Fixture | Required for | Required properties | Status |
|---|---|---|---|
| `rank04` Naked Pair | AN1, CT-S2, CT-R7, CT-EC1–EC4, CT-PR1, CT-PR3, CT-CA4 | Naked Pair is lowest applicable; `roles.cause.length === 2`; `digits.length === 2`; at least 1 elim target | Present; needs AN test enablement |
| `rank05` Hidden Pair | AN2 | Hidden Pair is lowest applicable; `roles.elimTarget` empty; `eliminations` non-empty | Present; analyzer tests commented out |
| `rank05OneElimCell` regression | AN3 | One pair cell has zero eliminations (pure bivalue already); pair-cell derivation must not depend on eliminations containing both cells | **Pending** — capture from live play |
| `rank06` Naked Triple | AN4 | Naked Triple lowest applicable; `roles.cause.length === 3`; `digits.length === 3` | Present; tests commented out |
| `rank07` Hidden Triple | AN5 | Hidden Triple lowest applicable; `roles.cause.length === 3`; `roles.elimTarget` empty | **Pending** — hard to construct manually; capture from live play |
| `rank08` + `rank08Transpose` X-Wing | AN6–AN8 | X-Wing lowest applicable. **Two fixtures needed** for both orientations (row-locked and column-locked). | Existing `rank08` is approximate; verify it produces an actual X-Wing step; add second-orientation fixture |
| `rank09Row` + `rank09Col` Swordfish | AN9–AN10 | Swordfish lowest applicable; two orientations needed | Existing `rank09` is approximate; needs second orientation |
| `rank10Row` + `rank10Col` Jellyfish | AN11–AN12 | Jellyfish lowest applicable; two orientations needed | Existing `rank10` is approximate; needs second orientation |
| `rank11` XY-Wing | AN13 | XY-Wing lowest applicable; 3 cause cells with correct `{X,Y}/{X,Z}/{Y,Z}` pattern | Existing `rank11` is approximate |
| `rank12` Simple Coloring Rule 2 | AN14 | Elim targets fall *inside* the chain | Existing `rank12` shape unverified |
| `rank12Rule4` Simple Coloring Rule 4 | AN15 | Elim targets are *outside* the chain (uncolored cell sees both colors) | **New fixture needed** |
| `rank13` Multi-Coloring | AN16 | Lowest applicable; two chains with mutual elim | Existing `rank13` is approximate |
| `rank14Short` XY-Chain (short) | AN17 | Lowest applicable; chain length ≤ 6 | Existing; needs verification |
| `rank14Long` XY-Chain (long) | AN18 | Lowest applicable; chain length **> 6** | Currently = `rank14Short` — **separate fixture needed** |
| `rank15` Forcing Chain | AN19 | Lowest applicable; produces Forcing Chain | Existing is approximate; existing test conditionally skips if technique doesn't fire |
| `rank03Pointing` (row) | AN20 | Cause cells share a box and a row | May need explicit row-pointing fixture separate from existing `rank03` |
| `rank03PointingCol` | AN21 | Cause cells share a box and a column | **New fixture** |
| `rank03ClaimingRow` | AN22 | Cause cells share a row and a box (claiming) | **New fixture** |
| `rank03ClaimingCol` | AN23 | Cause cells share a column and a box | **New fixture** |
| `rank02Row` | AN24 | Hidden Single hidden in a row (row check succeeds first) | Existing `rank02` may already be row-hiding — verify |
| `rank02Col` | AN25 | Hidden Single hidden in a column; row check must fail first | **New fixture needed** |
| `rank02Box` | AN26 | Hidden Single hidden in a box; both row and col checks fail | **New fixture needed** |

**Recommendation:** Capture fixtures for ranks 7, 12-Rule4, 13, 14Long, and 15 from live puzzle play using a logged DFS trace from `solveLogically`. Manual construction of rank 7–15 boards is impractical. The Fixture Author should tag each fixture file with the AN test IDs that consume it in `docs/misc/coach-fixture-tracker.md`.

---

## 6. Risks and gaps

**R1 — Fixture cascade risk.** Most P1 analyzer tests are blocked on rank-clean fixtures. Gate each AN test with a fixture-validity guard (AN28-style: `if (analyze(puzzle).rank !== N) throw new Error('fixture-drift')`) so a silent fixture regression fails loudly rather than silently with `this.skip()`.

**R2 — Hidden Single col/box unit-label phrasing.** The analyzer's supporting text uses `step.unit.type` directly in the template, which produces the string `'col'`, not `'column'`. The fspec text in §8.2 uses `'column'`. The Test Writer should run the analyzer on a col-hidden fixture and copy the exact `supportingText` before writing AN25 / CT-R6 assertions. If the implementation emits `'col'`, flag the discrepancy to the Reviewer.

**R3 — CT-NT2 timing mismatch (existing test).** The existing CT-NT2 waits 3500ms for the error toast to dismiss, but the implementation uses a 5000ms timeout. Fix CT-NT2 to wait 5500ms and add an intermediate assertion that the toast is *still* visible at the 3500ms mark.

**R4 — Timer-based flakiness.** Tests CT-R4, CT-EC3, CT-NT2–NT5 depend on real timer waits with 0.5–1.0s safety margins. Under heavy CI load these are the most likely to flake. Mitigation: expose a hook in `coach.js` to swap the timer source for tests, or accept the 1.0s safety margin and rely on retry logic.

**R5 — Win-during-recap test difficulty.** SS16 and CT-W1 require a board where the coached-cell fill is the final move. For SS16, `nakedSinglePuzzle()` (cell 0 is only empty) works — verify `state.won === true` after the dispatch, not just `coachSession === null`. For CT-W1, use an existing puzzle infrastructure fixture (e.g., fill all cells of `rank01` except the target via dispatch before pressing Coach).

**R6 — Reducer internal-dispatch ordering.** SS11 verifies `PEN_ENTER` coach block runs after pen mutation. `COACH_FILL_RECAP` dispatched internally produces a separate `'changed'` emit. Tests that count emits (SS7, SS10, SS14) must filter by `action.type` or account for multiple emits per top-level dispatch.

**R7 — `coach.js` keydown handler is global.** CT-HK1 must create form-control elements inside the iframe (`iframe.contentDocument.createElement('input')`) and dispatch events on `doc(iframe)`, not the host document.

**R8 — `_lastSessionHadErrorRecap` global module state.** This flag persists across test cases within the same iframe load. Run CT-NT5 in its own `describe` block with `beforeEach` that loads a fresh iframe to guarantee the flag is cleared.

**R9 — Branch coverage for `coach.js` is best-effort.** Do not over-engineer coach.js unit tests. Integration tests that exercise visible behavior (button class, panel content, recap text) are sufficient. Undocumented branch-coverage gaps in `coach.js` are acceptable.

**R10 — Fixture for `rank05OneElimCell`.** The pair-cell derivation bug occurs when one cause cell has no eliminations (all non-pair candidates already cleared). Constructing this case manually requires a puzzle position where one Hidden Pair cell is already pure. Capture from live play rather than constructing; the existing fixture-tracker comment describes the scenario precisely.

**R11 — `arch.test.js` unchanged.** No new files or imports are added beyond those already imported in the existing test files. No arch test updates required.

**R12 — `canonicalise` is module-private.** AN33 (P3) cannot be tested by direct invocation without modifying the sealed module contract. Drop to P3 and mark as "covered by code review, not tested." The function is two lines.
