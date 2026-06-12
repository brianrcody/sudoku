# Architectural Spec — Harder Difficulty Tiers
**Status:** Final
**Date:** 2026-06-12
**Author:** Uber Developer (Architect stage)
**Inputs:** rspec-003, fspec-003, vspec-003, spike report (`docs/misc/v3-harder-tiers-spike.md`)

> **Also load:** `aspec-overview.md`, `aspec-techniques.md`, `aspec-generation.md`,
> `aspec-coach-analyzer.md` (amended by §8 of this spec).

---

## 1. Scope and Staging

Implements fspec-003 in three increments, each exiting with the full suite green:

- **Increment A (Step 0):** ladder enrichment ranks 12–15, tier-ID decoupling + rename +
  migration, config.
- **Increment B (Step 1):** Unique Rectangle (rank 20), Diabolical tier, generation
  progress/cancel/fallback UX.
- **Increment C (Step 2):** ALS-XZ (rank 21), Nightmare tier, limited-coaching policy.

Coach analyzer/UI work for each increment's techniques lands with that increment.

## 2. Technique Ladder (final)

`js/solver/techniques/index.js` exports, in rank order:

| Rank | Technique | Module | Status |
|---:|---|---|---|
| 1–11 | (unchanged: NS, HS, LC, NP, HP, NT, HT, X-Wing, Swordfish, Jellyfish, XY-Wing) | existing | unchanged |
| 12 | XYZ-Wing | `xyzWing.js` | **new** |
| 13 | WXYZ-Wing | `wxyzWing.js` | **new** |
| 14 | Finned X-Wing | `finnedFish.js` (`finnedXWing`) | **new** |
| 15 | Finned Swordfish | `finnedFish.js` (`finnedSwordfish`) | **new** |
| 16 | Simple Coloring | existing | shifted from 12 |
| 17 | Multi-Coloring | existing | shifted from 13 |
| 18 | XY-Chain | existing | shifted from 14 |
| 19 | Forcing Chain | existing | shifted from 15 |
| 20 | Unique Rectangle | `uniqueRectangle.js` | **new** |
| 21 | ALS-XZ | `alsXz.js` | **new** |

`tierForRank` (in `logical.js`):
`0→null, ≤1 kiddie, ≤2 easy, ≤7 medium, ≤11 hard, ≤19 expert, ≤20 diabolical,
≤21 nightmare, else 'beyond-nightmare'`.

**Rating invariants (testable):** Kiddie–Hard ratings are bitwise-unchanged (puzzles
solvable with ranks ≤11 never consult rank ≥12). Expert (old death-march) membership is
preserved as a set; the new rank-12–15 techniques only re-distribute hardest-rank values
*within* Expert and convert some previously `beyond-*` boards into Expert.

## 3. New Technique Modules (all in `js/solver/techniques/`, standard contract)

All modules are pure `(state) → result|null`, return on first progress, and carry extra
pattern fields for the coach (whitelisted through `logical.js` — see §7).

### 3.1 `xyzWing.js` — rank 12
Pivot cell with exactly candidates `{X,Y,Z}`; two bivalue wings `{X,Z}`, `{Y,Z}`, each a
peer of the pivot, wings not sharing both digits. Eliminate Z from unfilled cells (outside
the pattern) that see **all three** pattern cells. Extra fields: `pivot`, `wings`, `z`.

### 3.2 `wxyzWing.js` — rank 13
Bent-ALS formulation (sound, enumeration-bounded): for each intersecting line/box pair,
consider unfilled cells of their union; choose 4 cells whose candidate union has exactly
4 digits, at least one cell in each of (line-only, box) regions. For a digit Z of the
union: if for **every other** digit d of the union, all 4-set cells containing d are
mutually visible, then at least one set cell must hold Z (pigeonhole) → eliminate Z from
outside cells seeing every Z-bearing set cell. Skip Z when the Z-cells are all mutually
visible *and* share a unit with the whole set (degenerate = naked quad; subsumed). Extra
fields: `cells`, `z`.

### 3.3 `finnedFish.js` — ranks 14–15
`finnedFish(state, size, baseUnits, coverUnits)` generalizing `fish()`:
choose `size` base units for digit d; candidate positions must fit `size` cover units
**except** surplus candidates (fins) confined to a single box, all in one base unit.
Eliminations: d from cells that are (a) in a cover unit of the pattern, (b) in the fin
box, (c) not base-pattern cells or fins. Both orientations (rows/cols). Exports
`finnedXWing` (size 2) and `finnedSwordfish` (size 3); sashimi degenerate cases are
permitted (a base unit may have as few as 1 cover-set candidate when fins exist).
Extra fields: `baseCells`, `fins`, `digit`.

### 3.4 `uniqueRectangle.js` — rank 20
Scan row pairs × column pairs spanning exactly two boxes, all four cells unfilled.
With floor pair `{a,b}`:
- **Type 1:** three corners exactly `{a,b}`, roof ⊇ `{a,b}` with ≥1 extra → eliminate
  a, b from roof.
- **Type 2:** two corners exactly `{a,b}`, the other two exactly `{a,b,c}` (same c) →
  eliminate c from outside cells seeing both `{a,b,c}` corners.
- **Type 4:** two corners exactly `{a,b}` (the floor), the roof pair contains `{a,b}`+
  extras and shares a unit in which digit a appears **only** in the roof pair → eliminate
  b from both roof cells (then symmetric check with b locked → eliminate a).
Type order tried: 1, 2, 4. Technique string `'Unique Rectangle'`; extra fields `urType`
(1|2|4), `urCells` ([floor…, roof…] in r1c1/r1c2/r2c1/r2c2 order), `urDigits` ([a,b]),
`urExtra` (c for Type 2; eliminated digit for Type 4).

### 3.5 `alsXz.js` — rank 21
Port of the spike module (sets ≤ 4 cells per ALS, unit-scoped enumeration with cross-unit
dedupe, O(1) peer matrix): disjoint ALS pair, restricted common X, common Z ≠ X →
eliminate Z from outside cells seeing every Z-cell of both sets. Extra fields: `alsA`,
`alsB`, `x`, `z`.

**Soundness gate (all five modules):** must pass the randomized sweep (§10) before any
tier wiring.

## 4. Tier IDs, Config, Migration

### 4.1 `js/config.js`
```js
DIFFICULTY_ORDER = ['kiddie','easy','medium','hard','expert','diabolical','nightmare'];
```
`HINT_LIMITS / CHECK_VISIBLE / CORRECTNESS_MODE`: `expert` takes the old `death-march`
values; `diabolical`, `nightmare` copy `expert` (0 / false / 'on-complete-silent').
`GIVEN_COUNT_TARGET`: expert `{22,26}` (unchanged values); diabolical & nightmare
`{min:20, max:27}` (min is rarely reached — effectively strip-to-minimal, matching spike
sampling). `ATTEMPT_BUDGET`: expert 300, diabolical 2000, nightmare 300 (spike §1 sizing).

### 4.2 Migration (`js/persist/migrate.js`, called first thing in `main.js`)
Stateless and idempotent (no version marker — every operation is a cheap key check;
deviation from fspec §3.5's "marker" noted as the lower-complexity interpretation with
identical observable behavior):
1. `sudoku.currentDifficulty.v1` value `'death-march'` → `'expert'`.
2. `sudoku.state.v1` blob `difficulty === 'death-march'` → `'expert'` (single rewrite).
3. `localStorage.removeItem('sudoku.pregen.v1.death-march')` (stale-rater discard,
   fspec §3.4).
4. Stats cookie: inside `cookieStatsStore.load()` — if `stats['death-march']` exists,
   merge its counters into `expert` and delete the key; `defaultStats()` covers all seven
   IDs. (Cookie write happens on next natural save; reads are already migrated in-memory.)

### 4.3 Hardcoded-ID sweep
`clientGenProvider._loadFromStorage` iterates `DIFFICULTY_ORDER` (import) instead of its
local list. `ui/controls.js` and `ui/stats.js` render the seven tiers from a shared
`TIER_LABELS` map exported from `config.js`:
```js
TIER_LABELS = { kiddie:'Kiddie', easy:'Easy', medium:'Medium', hard:'Hard',
                expert:'Expert', diabolical:'Diabolical', nightmare:'Nightmare' };
```

## 5. Generation: Progress, Cancel, Honest Fallback

### 5.1 Provider API change
`requestPuzzle({ difficulty, signal, onProgress })` now resolves
**`{ puzzle, fallback }`** (was bare `puzzle`). `onProgress({attempts, budget})` is
forwarded from GEN_PROGRESS messages for the matching request id (foreground only).
Cache hits resolve `{ puzzle, fallback: false }` immediately. Update both `main.js` call
sites and tests. Worker and protocol are unchanged (already carry progress + fallback).

### 5.2 State additions (`game/state.js`)
- `genProgress: {attempts:int, budget:int} | null` — new field; action
  `GEN_PROGRESS {attempts, budget}` sets it; `SET_GENERATING {flag:false}` and
  `PUZZLE_LOADED`/`NEW_PUZZLE` clear it to null. Emits key `'genProgress'`.

### 5.3 Busy UI (`js/ui/busy.js`, new; root `#busy-root` added to `index.html` inside the
grid column, after `#grid-root`)
Subscribes to `generating`, `generatingMessage`, `genProgress`. Renders the vspec §4 card
when `generating === true`. Progress line appears only when (a) the active difficulty is
`diabolical`/`nightmare` (read from the pending request difficulty passed via
`SET_GENERATING {message, difficulty}` — action gains an optional `difficulty` field) and
(b) ≥3 s elapsed since `generating` became true (module-local timer). Cancel button per
vspec; `mount(root, gameState, { onCancel })`. SR announcements via `srLive.announce`,
throttled to one per 10 s (fspec §9.2). Buttons/spinner CSS in `css/controls.css`
(`.busy-card`, `.busy-progress`, `.busy-spinner`).

### 5.4 `main.js` flow changes
- Keep an `AbortController` per foreground request; `onCancel` aborts it, dispatches
  `SET_GENERATING {flag:false}`, restores the previous difficulty selection (dispatch
  `CHANGE_DIFFICULTY` back when the request came from a difficulty change… not applicable:
  difficulty change does not auto-generate; cancel paths are initial-load and New Puzzle,
  which restore the pre-existing state by simply clearing `generating`).
- On resolve: if `fallback === false` → existing PUZZLE_LOADED/NEW_PUZZLE path. If
  `fallback === true` **and requested tier is diabolical or nightmare** → open the fspec
  §5.4 dialog (existing `ui/dialog.js`): confirm loads the puzzle (labeled
  `puzzle.difficulty`, the true tier) and persists `DIFF_KEY = puzzle.difficulty`; cancel
  just clears `generating`. Other tiers keep the legacy behavior (load silently with true
  tier label — same as today).
- Progress wiring: `onProgress` dispatches `GEN_PROGRESS`.
- Mid-generation difficulty change (fspec §10.1): `controls.js` is unchanged; `main.js`
  listens for `CHANGE_DIFFICULTY` while a foreground request is pending → abort it and
  clear `generating` (the user then presses New Puzzle as usual).

## 6. Statistics
No structural change: `statsProvider`/`statistics.js` are keyed by
`puzzle.difficulty` already; new IDs flow through. `ui/stats.js` renders seven rows from
`TIER_LABELS`.

## 7. `logical.js` pass-through
Extend the elimination-step pass-through whitelist with the new pattern fields:
`pivot, wings, z, cells, baseCells, fins, digit, urType, urCells, urDigits, urExtra,
alsA, alsB, x`. (Same mechanism as the existing `colorChain/chain` fields.)

## 8. Coach — Sealed-Schema Amendment + New Mappers

**Amendment to `aspec-coach-analyzer.md` (approved by the Uber Developer acting as
Orchestrator, per the sealing note; an amendment pointer is added to that file):**
1. `roles.fin: int[]` — new role array, `[]` for all techniques except Finned X-Wing /
   Finned Swordfish. Renders as `.coached-fin` (vspec-003 §6).
2. `rank` range becomes 1–21; existing rank-specific references re-bind: XY-Chain = 18,
   Forcing Chain = 19 (`COMPLEXITY_THRESHOLD` logic unchanged).
3. Six new canonical names: `'XYZ-Wing'`, `'WXYZ-Wing'`, `'Finned X-Wing'`,
   `'Finned Swordfish'`, `'Unique Rectangle'`, `'ALS-XZ'`.

**New mappers (in `analyzer.js` `MAPPERS`), texts from fspec-003 §6:**

| Technique | roles | arrows | notes |
|---|---|---|---|
| XYZ-Wing | cause=[pivot,w1,w2]; elimTarget | chain-edge pivot→each wing (strong) + dashed to elims | digits=[Z] |
| WXYZ-Wing | cause=cells (4); elimTarget | chain-edge pivot-ish: from `cells[0]` to others + dashed to elims | digits=[Z] |
| Finned X-Wing | cause=baseCells corners; **fin=fins**; elimTarget | connector-chain rectangle over base corners + dashed fin→elims | digits=[D] |
| Finned Swordfish | cause=baseCells; fin=fins; elimTarget | connector-chain over bounding corners + dashed fin→elims | digits=[D] |
| Unique Rectangle | cause=urCells; elimTarget | connector-chain rectangle (4 corners) + dashed to outside elims | digits=urDigits; per-type supportingText (fspec §6.5) |
| ALS-XZ | scA=alsA, scB=alsB, elimTarget; cause=[] | **none** | digits=[Z]; `complexity = { acknowledged: true, note: fspec §6.6 note, endpoints: null }` |

`grid.js` adds `roles.fin → .coached-fin`. `css/grid.css` (coach section) adds the
`.coached-fin` rules per vspec-003 §6 (composes existing `--coach*` tokens; no theme
edits). `coach.js`/`coachOverlay.js` need no structural change (ALS reuses the
acknowledged-note path; new arrows use existing styles). The "all roles arrays present"
sealing guarantee extends to `fin` (every mapper emits it, `[]` default in the driver).

## 9. Implementation Sequence

A1. `xyzWing.js` + `wxyzWing.js` + `finnedFish.js` + fixtures/unit tests + sweep.
A2. `index.js` ladder + `tierForRank` + `logical.js` pass-through; config IDs/labels;
    re-run regression suite (Kiddie–Hard invariance; Expert set preservation spot-check).
A3. `migrate.js` + `cookieStatsStore` merge + provider storage-key sweep + tests.
A4. `controls.js` / `stats.js` seven tiers; rename verification (no 'Death March' string).
A5. Coach mappers + `fin` role + CSS for Increment A techniques + analyzer tests.
   → **suite green = Step 0 exit.**
B1. `uniqueRectangle.js` (+ fixtures, sweep) → ladder rank 20 → tier wiring.
B2. Provider API change (`{puzzle, fallback}` + `onProgress`), `GEN_PROGRESS` state,
    `busy.js` + `#busy-root` + CSS, `main.js` flows (cancel, fallback dialog, mid-gen
    difficulty change).
B3. UR coach mapper + tests; integration tests for busy/cancel/dialog.
   → **suite green = Step 1 exit.**
C1. `alsXz.js` production port (+ fixtures, sweep) → rank 21 → Nightmare wiring.
C2. ALS coach mapper (limited) + tests.
C3. In-browser generation-time validation for diabolical/nightmare (PERF harness entries
    with seeded RNG; budget thresholds: nightmare < 5 s, diabolical < 120 s with a seeded
    fast path asserted < 30 s).
   → **suite green = Step 2 exit.**

## 10. Test Infrastructure Additions

- **Soundness sweep (permanent):** `js/tests/unit/soundness.test.js` — seeded
  `mulberry32`, 40 random minimal puzzles in-browser, full final ladder; asserts no
  elimination of a solution digit, no contradicting placement, and ≥1 fire each for
  XY-Chain across the sample (anti-dead-code guard for chains; the new techniques get
  fire-assertions in their own fixture tests).
- **Fixture policy:** per `aspec-techniques.md` §7 (3 firing positions + 1 null) for each
  new module; fixtures hand-built in `js/tests/fixtures/techniques/` using `makeState`,
  mined from generator output where hand-construction is impractical (UR/ALS — mine with
  a throwaway script, then freeze the boards as literals with provenance comments).
- **Migration tests:** `js/tests/unit/migrate.test.js` (all four migrations + idempotence
  + absent-key no-ops).
- **Rating invariance:** extend `rater.test.js` — the curated regression fixtures must
  rate identically (Kiddie–Hard) / same-tier (Expert) under the new ladder.
- Coverage: same c8 pipeline; new files join `--include=js/**`.

## 11. Performance & Constraints

- Non-generation actions: unaffected (new techniques run only at solver stalls).
- Coach `analyze()` on Diabolical/Nightmare boards now runs the deeper ladder; worst-case
  ALS enumeration ~tens of ms (spike p99 164 ms full-solve; single-step analyze is much
  less) — within the 1 s action budget.
- No new dependencies. No server-side code. Static deployment unchanged
  (`deploy.txt` gains `js/persist/migrate.js`, `js/ui/busy.js`, new technique modules).
