
# Architectural Spec — Coach Mode Analyzer
**ID:** aspec-coach-analyzer
**Status:** Final (amended 2026-05-04)
**Date:** 2026-05-04
**Author:** Architect

> **Amendment 2026-05-04:** Added optional `pencil?` parameter to `analyze()` (§4), candidate intersection step in the execution algorithm (§4.2), and a clarifying note on `autoReveal.cells` filtering (§8).

**Loaded by:** Implementor (Phase 8 — Coach Mode), Reviewer, QE Test Writer, QE Test Runner. Also load when implementing the Coach UI module (`aspec-coach-ui.md`) — that spec consumes the `CoachStep` schema sealed here verbatim.

> **Also load:** `aspec-overview.md` — for the master directory tree and cross-cutting conventions.
> **Also load:** `aspec-solver.md` (§5, §6) — analyzer drives `solveLogically` directly and consumes its `Step` shape.
> **Also load:** `aspec-techniques.md` — for technique names, ordering, and the placement/elimination return shape produced by each technique module.
> **Also load:** `aspec-hints.md` (§1, §5) — for the working-board construction rule the analyzer reuses, and the Coach Mode Hook seam noted there.
> **Also load:** `fspec-002-coach.md` (§4, §6, §8) — functional source of truth for what the analyzer must produce.
> **Also load:** `vspec-002-coach.md` (§4, §5, §6) — visual source of truth for the CSS roles and SVG arrow shapes the schema must support.

> **CoachStep schema sealed — `aspec-coach-ui.md` must not modify this schema without Orchestrator approval.** The `CoachStep` type defined in §3 is a hard contract between this spec and the forthcoming UI spec. Any change after sealing requires re-opening this spec.

> **Amendment (2026-06-12, approved per the sealing process for the V3 harder-tiers
> feature):** `roles` gains a seventh array `fin: int[]` (non-empty only for Finned
> X-Wing / Finned Swordfish); `rank` extends to 1–21 with XY-Chain = 18 and Forcing
> Chain = 19; six canonical technique names are added (XYZ-Wing, WXYZ-Wing, Finned
> X-Wing, Finned Swordfish, Unique Rectangle, ALS-XZ). Normative mapper definitions for
> the new techniques live in `aspec-harder-tiers.md` §8. All other schema guarantees
> (every field present, null sentinels, no `undefined`) extend to the new role.

---

## Table of Contents

1. [Scope and Module Location](#1-scope-and-module-location)
2. [Module Contract](#2-module-contract)
3. [`CoachStep` Schema (Sealed)](#3-coachstep-schema-sealed)
4. [`analyze()` Entry Point](#4-analyze-entry-point)
5. [Working-Board Construction](#5-working-board-construction)
6. [Mapping Solver Steps to `CoachStep`](#6-mapping-solver-steps-to-coachstep)
7. [Per-Technique Output Specifications](#7-per-technique-output-specifications)
8. [Auto-Reveal Payload Construction](#8-auto-reveal-payload-construction)
9. [Null / No-Technique Case](#9-null--no-technique-case)
10. [Data Handoff to `CoachSession`](#10-data-handoff-to-coachsession)
11. [Directory Tree Delta](#11-directory-tree-delta)
12. [Implementation Sequence](#12-implementation-sequence)
13. [Test Strategy](#13-test-strategy)
14. [Non-Goals and Boundaries](#14-non-goals-and-boundaries)

---

## 1. Scope and Module Location

This spec defines the Coach Mode analyzer — a pure-function module that, given the current puzzle and player state, returns a fully-realised `CoachStep` describing the lowest-ranked logical move available, or signals that no move is available.

The analyzer is the data-producer half of Coach Mode. The data-consumer half (UI rendering, panel toggling, session lifecycle, snapshot/restore of pencil marks) is the responsibility of `aspec-coach-ui.md`.

### 1.1 File

```
js/coach/analyzer.js
```

This is a new file in a new `js/coach/` subtree (see §11 for the full directory delta).

### 1.2 Module Properties

The analyzer module must be:

- **Pure.** No global state, no module-level mutable variables. Every call is independent of every other call.
- **DOM-free.** No `document`, no `window`, no element references. Returns plain data only.
- **Emitter-free.** Does not import `js/util/events.js`. Does not subscribe to or emit any events. Callers integrate the analyzer's return value into their own state machine.
- **Persistence-free.** Does not read or write cookies or `localStorage`.
- **Provider-agnostic.** Does not import from `js/providers/`. In particular, it does not call `hintProvider.nextHint`. The analyzer drives `solveLogically` directly (per `aspec-hints.md` §5: "the coach analyzer is NOT the hint provider — it is a separate module that the UI will call directly").

The analyzer's only imports are from `js/solver/` and `js/util/`. This ruling is load-bearing: it lets the analyzer be unit-tested with synthetic puzzle/player inputs without booting any UI layer or storage layer.

### 1.3 Out of Scope for This Spec

The following belong to `aspec-coach-ui.md` and must not be specified here:

- The `CoachSession` slice of `GameState`.
- Any `dispatch` action types (`COACH_START`, `COACH_END`, etc.).
- Snapshot/restore of player pencil marks across a coach session.
- Rendering of cells, arrows, or the explanation panel.
- The Coach button DOM and its state-class swaps.
- Recap toast lifecycle and timing.
- Live-region announcements.
- Coach button → reducer wiring.

This spec defines exactly one thing: the data type that flows from analyzer to UI, and how that data is computed.

---

## 2. Module Contract

`js/coach/analyzer.js` exports exactly one named function:

```js
export function analyze(puzzle, playerState) → CoachStep | NoTechniqueResult
```

No default export. No other named exports. No constants exported (any module-private constants stay private).

The function is synchronous. It runs `solveLogically` once on the working board and returns. There is no async, no Worker, no promise. The solver is fast enough on the main thread (`aspec-solver.md` §4 — "well under 10 ms").

### 2.1 Coaching Model

The coach is **state-dependent**: each invocation analyzes the current board state (givens plus confirmed pen entries, filtered through the user's pencil marks) rather than following a fixed predetermined path through the solution. The practical consequences:

- **Order-dependence.** If the user makes moves before pressing Coach, those moves influence which technique fires first. Correct moves the user has already made are simply respected — the coach identifies the next applicable technique from the current state, not from an ideal starting position.
- **Completability.** From any valid (error-free) partial board state, the coach can always identify a next move. Coaching is guaranteed to make progress as long as the board remains consistent with the puzzle's solution.
- **Error gate.** If pen entries deviate from the correct solution in any way, the coach refuses to advise — it cannot provide locally-logical suggestions that might compound errors the user hasn't yet discovered. Pencil mark erasures are a partial exception: they are trusted as authoritative eliminations (see §9.1 for the rationale and tradeoff).

---

## 3. `CoachStep` Schema (Sealed)

This is the canonical type definition. The UI spec will reference the section heading and field names verbatim.

```js
CoachStep = {
  // --- Identity --------------------------------------------------------
  technique: string,                  // canonical technique name (see §3.1)
  rank: int,                          // 1–15, matching aspec-techniques.md §2
  type: 'placement' | 'elimination',  // drives recap behavior (fspec §9)

  // --- Cell roles (drive .coached-* CSS classes per vspec §4) ---------
  roles: {
    target: int | null,                  // .coached-target — placement only; null for elimination
    cause: int[],                        // .coached-cause — source/cause cells
    elimTarget: int[],                   // .coached-elim-target — cells where candidates removed
    unitMember: int[],                   // .coached-unit-member — Hidden Single only
    scA: int[],                          // .coached-sc-a — Simple/Multi-Coloring group A
    scB: int[],                          // .coached-sc-b — Simple/Multi-Coloring group B
  },

  // --- Concrete logical content used by text and visuals --------------
  digits: int[],                      // digit(s) involved (1–9). Length 1 for most;
                                      // length 2 for Naked Pair / Hidden Pair;
                                      // length 3 for Naked Triple / Hidden Triple.
  unit: {                             // present when the technique is unit-scoped;
    type: 'row' | 'col' | 'box',      // null otherwise (e.g., XY-Wing, fish, chains).
    index: int,                       // 0–8 within type
  } | null,

  // --- SVG overlay data (consumed by vspec §6) ------------------------
  arrows: Arrow[],                    // possibly empty; see §3.2 for Arrow shape

  // --- Eliminations (data-level, distinct from cell roles) ------------
  eliminations: [{ cellIndex: int, digit: int }],
                                      // every (cell, digit) that this technique removes;
                                      // empty for placement techniques.

  // --- Auto-reveal payload (consumed by UI snapshot/restore) ----------
  autoReveal: {
    required: bool,                   // false for ranks 1–2; true for ranks 3–15
    cells: [{ cellIndex: int, candidates: int }],
                                      // every cell whose candidates the explanation
                                      // references; `candidates` is a 9-bit bitset
                                      // computed from the working board.
  },

  // --- Supporting text ------------------------------------------------
  supportingText: string,             // fully interpolated; ready to render. May
                                      // contain *single-asterisk* runs to mark
                                      // emphasis spans (digits, cell refs) — the
                                      // UI converts these to <em> per vspec §7.4.

  // --- Complexity acknowledgment (XY-Chain, Forcing Chain) ------------
  complexity: {
    acknowledged: bool,               // true for rank 14/15; rank 14 only when chain
                                      // length ≥ COMPLEXITY_THRESHOLD (see §7.14).
    note: string | null,              // additional sentence to render after
                                      // supportingText. null when acknowledged: false.
    endpoints: int[] | null,          // chain endpoint cell indices for
                                      // chain techniques; null otherwise.
  },
}
```

**Sealing note:** Every field above is required to be present on every `CoachStep` returned by `analyze()`. Fields whose value is "absent" use the documented null sentinel (`null`, `[]`, or the documented default), never `undefined`. This guarantee lets the UI spec destructure without optional-chaining everywhere.

### 3.1 Canonical Technique Names

`technique` uses the exact strings produced by the technique modules in `js/solver/techniques/`. The analyzer must not rename or remap them. The 15 canonical names are:

| Rank | `technique` value |
|---:|---|
| 1 | `'Naked Single'` |
| 2 | `'Hidden Single'` |
| 3 | `'Locked Candidates'` (covers both pointing and claiming) |
| 4 | `'Naked Pair'` |
| 5 | `'Hidden Pair'` |
| 6 | `'Naked Triple'` |
| 7 | `'Hidden Triple'` |
| 8 | `'X-Wing'` |
| 9 | `'Swordfish'` |
| 10 | `'Jellyfish'` |
| 11 | `'XY-Wing'` |
| 12 | `'Simple Coloring'` |
| 13 | `'Multi-Coloring'` |
| 14 | `'XY-Chain'` |
| 15 | `'Forcing Chain'` |

If, during implementation, any technique module emits a slightly different string (e.g., `'Locked Candidates (pointing)'`), the analyzer normalises by stripping any parenthetical suffix before assigning to `CoachStep.technique`. The original sub-variant information is preserved, where relevant, by the supporting-text generator (e.g., the Locked Candidates pointing-vs-claiming text is selected from the cell layout, not from a string suffix).

### 3.2 `Arrow` Shape

```js
Arrow =
  | { from: int, to: int, style: 'straight-arrow' }
  | { from: int, to: int, style: 'dashed-arrow' }
  | { from: int, to: int, style: 'bezier-arc',
      controlOffsetY?: int }                  // default -18 (px above midpoint)
  | { points: int[],          style: 'connector-chain' }
                                              // closed polyline of cell indices for fish
                                              // rectangles (X-Wing) and the 3×3 / 4×4
                                              // fish outlines (Swordfish, Jellyfish).
                                              // The renderer connects points in order
                                              // and closes the figure. Use this for
                                              // pure outline shapes, not directional
                                              // arrows.
  | { from: int, to: int, style: 'elim-line' }
                                              // Hidden Single elimination line: straight
                                              // from cause cell center, through the
                                              // eliminated cell, stopping at its far
                                              // boundary. No arrowhead. Rendered with
                                              // reduced opacity to distinguish from
                                              // directional arrows.
  | { from: int, to: int, style: 'chain-edge',
      strong?: bool }                         // chain link for coloring chains and
                                              // XY-Chain. `strong: true` denotes a
                                              // strong link (rendered solid); false or
                                              // omitted denotes a weak link
                                              // (rendered dashed/lighter). The UI
                                              // spec finalises stroke styling.
```

The renderer in the UI spec consumes `arrows` and emits `<line>`, `<path>`, or `<polyline>` SVG elements with the styles defined in vspec §6. Pixel offsets (16px from peer center, 20px from target, 18px Bézier rise) are renderer concerns, not analyzer concerns — the analyzer supplies cell indices only.

`arrows` may be the empty array for techniques that communicate purely through cell-role classes (Hidden Pair, Hidden Triple, where the visual is "two/three cells highlighted with annotated candidates" and no directional pointer is meaningful).

For the long-chain techniques (rank 14 and rank 15), `arrows` may contain only endpoint markers when the chain exceeds `COMPLEXITY_THRESHOLD`; see §7.14 and §7.15. The schema accommodates partial chains because every `Arrow` entry is independently valid — the renderer does not require chain closure.

### 3.3 Bitset Encoding for `autoReveal.cells[*].candidates`

`candidates` is a 9-bit integer using the encoding from `js/util/bitset.js`: bit 1 = digit 1 … bit 9 = digit 9. The analyzer must compute these from the working board, not copy them from the player's existing pencil marks. This is what "auto-reveal" means at the data layer — the UI receives the *correct* candidate set, regardless of what the player currently has marked.

---

## 4. `analyze()` Entry Point

```js
export function analyze(
  puzzle: {
    givens: Uint8Array(81),
    solution: Uint8Array(81),
    difficulty: string,
    id: string,
    // (additional fields ignored)
  },
  playerState: {
    pen: Uint8Array(81),
    conflicts: Set<int>,
    pencil?: Uint16Array(81) | null,   // optional — see §4.1 and §4.2
  }
) → CoachStep | NoTechniqueResult
```

### 4.1 Inputs

The two-argument shape mirrors `hintProvider.nextHint` deliberately. The analyzer does not need or want the full `GameState`; it only needs the puzzle identity and the pieces of player state required to construct a working board and, optionally, to restrict candidates to what the user currently has marked.

`playerState.pencil` is optional. When provided (and non-null), it is a `Uint16Array(81)` using the same 9-bit encoding as `GameState.pencil` (bit 1 = digit 1 … bit 9 = digit 9). When absent, `null`, or `undefined`, the analyzer behaves identically to the pre-amendment form — candidates are computed purely from the working board.

The UI spec calls `analyze(state.puzzle, { pen: state.pen, conflicts: state.conflicts, pencil: state.pencil })` from its coach-start path (§6.5 and §3.1 in `aspec-coach-ui.md`).

### 4.2 Execution Order

1. Build the working board (§5).
2. Call `solveLogically(workingBoard)` — no `techniqueLimit`, full ladder. This produces a `candidates` array representing the full logical candidate set for each cell.
3. **Candidate intersection (pencil-awareness):** If `playerState.pencil` is provided and non-null, apply the following for each empty cell `i` (where `pen[i] === 0`):
   - If `playerState.pencil[i] !== 0`: restrict `candidates[i]` to `candidates[i] & playerState.pencil[i]`. This intersects the logical candidate set with the user's current marks, so candidates the user has already cleared are invisible to the technique ladder.
   - If `playerState.pencil[i] === 0`: leave `candidates[i]` unchanged. The user has no pencil marks for this cell; do not restrict.
   - For filled cells (`pen[i] !== 0`): pencil is irrelevant; skip.
4. If the solver trace is empty (and no candidate intersection changed the picture), return the null/no-technique result (§9).
5. Re-run technique selection against the (possibly intersected) `candidates` array, or equivalently: if the initial `solveLogically` trace is empty after the intersection would have had effect, return `NoTechniqueResult`. In practice, the intersection is applied before the technique ladder runs the `MAPPERS` dispatch — the intersection narrows what candidates are visible, so techniques that required an already-user-cleared candidate will not fire.
6. Otherwise, take the first `Step` from `trace` and pass it through the per-technique mapper (§6, §7) to produce a `CoachStep`.
7. Return the `CoachStep`.

**Effect of pencil intersection:** If the user has cleared all indicated elimination-target candidates for an elimination technique in their pencil marks, the analyzer will not return that technique — the relevant candidates are absent from the intersected set and the technique does not fire. The analyzer naturally advances to the next applicable technique, or returns `NoTechniqueResult` if nothing applicable remains.

**Backwards compatibility:** `pencil` is optional. If not provided (or `null`/`undefined`), the execution order is identical to steps 1–2 and 4–7 above (step 3 is skipped entirely), and the function's behavior is unchanged from the pre-amendment form.

The "first step" rule guarantees the lowest-ranked technique applicable, which is what the user wants — coach with the easiest move first (per fspec §4.1 step 1: "the lowest-ranked technique in the technique ladder that can make progress").

---

## 5. Working-Board Construction

Identical rule to the hint provider (`aspec-hints.md` §1):

> Start with `puzzle.givens`; overlay `playerState.pen` values that are non-zero and not conflict-flagged (i.e., not in `playerState.conflicts`). Pencil marks are ignored — candidates are recomputed fresh from the working board.

Pseudocode:

```js
const working = new Uint8Array(81);
for (let i = 0; i < 81; i++) {
  if (puzzle.givens[i] !== 0) {
    working[i] = puzzle.givens[i];
  } else if (playerState.pen[i] !== 0 && !playerState.conflicts.has(i)) {
    working[i] = playerState.pen[i];
  } else {
    working[i] = 0;
  }
}
```

Conflict-flagged entries are omitted as a defence-in-depth measure. In practice, the pre-solver error check (§9.1) refuses to coach whenever `playerState.conflicts` is non-empty, so `buildWorkingBoard` is only ever called on a conflict-free player state. The exclusion rule is retained to keep the hint provider and analyzer working-board construction identical — they share the same rule verbatim so that Hint and Coach can never disagree about which cells are "filled" for purposes of candidate computation.

This rule is explicitly shared between hint provider and analyzer to keep "what the helper sees" identical across both features. Diverging would create a class of bug where Hint and Coach disagree about the next move.

---

## 6. Mapping Solver Steps to `CoachStep`

The first `Step` from `solveLogically(workingBoard).trace` has shape:

```js
Step = {
  cellIndex: int,
  digit: int | null,
  technique: string,
  eliminations: [{ cellIndex: int, digit: int }],
}
```

The analyzer converts this into a `CoachStep` via a per-technique mapper. The driver in `analyze()` dispatches on `Step.technique`:

```js
const mapper = MAPPERS[step.technique];   // table indexed by canonical name
return mapper(step, workingBoard, candidates);
```

### 6.1 Shared Inputs to Every Mapper

Every per-technique mapper receives:

- `step` — the solver `Step` for the move. For ranks 1–11, only the four base fields are present. For ranks 12–15, `step` additionally carries chain data passed through by `logical.js` (see `aspec-solver.md` §6 for the full shape):
  - Rank 12 (Simple Coloring): `step.colorChain` — `{ digit, groupA: int[], groupB: int[] }`
  - Rank 13 (Multi-Coloring): `step.colorChains` — `Array<{ digit, groupA: int[], groupB: int[] }>`
  - Rank 14 (XY-Chain): `step.chain` — `{ cells: int[], digit: int }`
  - Rank 15 (Forcing Chain): `step.chain` — `{ nodes: Array<{ cell, digit, strong }> }`
- `workingBoard` — the `Uint8Array(81)` constructed in §5.
- `candidates` — `Uint16Array(81)` from `solveLogically`'s return value (the candidates as they were *just before* the technique fired, since the trace is recorded pre-application; see `aspec-solver.md` §7.2).

If the solver implementation records candidates post-application instead, the analyzer recomputes the pre-state by calling `initialCandidates(workingBoard)` directly — the analyzer must not rely on the solver's intermediate candidate snapshots. This is a safety property: the analyzer is correct for the working board it constructed, regardless of what the solver chose to capture.

### 6.2 Shared Outputs Filled by the Mapper Driver

Some `CoachStep` fields are uniform across all techniques and are filled by the driver, not by per-technique mappers:

- `technique` — copied from `step.technique` (after normalisation per §3.1).
- `rank` — looked up by name in the canonical name table (§3.1).
- `type` — `'placement'` for ranks 1–2, `'elimination'` for ranks 3–15.
- `eliminations` — copied verbatim from `step.eliminations`.
- `autoReveal.required` — `false` for ranks 1–2, `true` for all others.
- `autoReveal.cells` — built per §8 by collecting `roles.cause ∪ roles.target ∪ roles.elimTarget ∪ roles.unitMember ∪ roles.scA ∪ roles.scB`, then computing `candidates[i]` for each.

Per-technique mappers fill the remaining fields: `roles`, `digits`, `unit`, `arrows`, `supportingText`, and `complexity`.

### 6.3 Driver Pseudocode

```js
function analyze(puzzle, playerState) {
  // Pre-flight error checks — see §9.1.
  if (playerState.conflicts.size > 0) {
    return { type: 'no-technique', reason: 'error' };
  }
  for (let i = 0; i < 81; i++) {
    if (puzzle.givens[i] !== 0 || playerState.pen[i] === 0) continue;
    if (playerState.pen[i] !== puzzle.solution[i]) {
      return { type: 'no-technique', reason: 'error' };
    }
  }

  const workingBoard = buildWorkingBoard(puzzle, playerState);
  const candidates = initialCandidates(workingBoard);

  // Candidate intersection — restrict to user's pencil marks when provided.
  if (playerState.pencil != null) {
    for (let i = 0; i < 81; i++) {
      if (playerState.pen[i] !== 0) continue;        // filled cell — skip
      if (playerState.pencil[i] !== 0) {             // user has marks — intersect
        candidates[i] = candidates[i] & playerState.pencil[i];
      }
      // pencil[i] === 0: no user marks — leave candidates[i] unchanged
    }
  }

  const result = solveLogically(workingBoard, candidates);  // pass intersected candidates
  if (result.trace.length === 0) {
    return buildNullStep(workingBoard, result, puzzle);  // see §9
  }
  const step = result.trace[0];
  const techniqueName = canonicalise(step.technique);
  const mapper = MAPPERS[techniqueName];
  const partial = mapper(step, workingBoard, candidates);
  return {
    ...partial,
    technique: techniqueName,
    rank: RANK_BY_NAME[techniqueName],
    type: techniqueName === 'Naked Single' || techniqueName === 'Hidden Single'
      ? 'placement' : 'elimination',
    eliminations: [...step.eliminations],
    autoReveal: buildAutoReveal(partial.roles, candidates, RANK_BY_NAME[techniqueName]),
  };
}
```

`MAPPERS` is a module-private object literal — one entry per canonical technique name. The full table is the subject of §7.

---

## 7. Per-Technique Output Specifications

The 15 sub-sections below specify, for each technique, exactly what every per-technique mapper must produce. Each entry covers: cell roles, digits, unit, arrows, supporting text, and (where applicable) complexity acknowledgment.

Conventions used in this section:

- `target = step.cellIndex` for placement steps.
- "Filled peer of cell `c`" means a cell `p ∈ PEERS[c]` with `workingBoard[p] !== 0`.
- "Eliminating peers" of cell `c` for digit `d` means filled peers of `c` whose value contributes to removing `d` from `candidates[c]`.
- All `int[]` outputs are deduplicated. Order is not load-bearing for `roles.*` (the UI applies CSS classes) but stable order helps testing — mappers should emit indices in ascending order unless a technique-specific order is more meaningful.
- All cell indices are 0–80 (row-major).
- `unit.type` and `unit.index` are derived from `UNITS_OF[i]` and `UNITS` (`aspec-solver.md` §1) — the analyzer never hardcodes unit indices.

The supporting-text patterns below follow the fspec §8 wording exactly. Bracketed parameters `[digit]`, `[row/column/box]`, etc. are interpolated at analyzer time using the working-board values. Asterisk-bracketed runs `*…*` denote emphasis spans the UI converts to `<em>` per vspec §7.4.

---

### 7.1 Naked Single (rank 1, Placement)

**Solver step:** `step.cellIndex = target`, `step.digit = D`, `step.eliminations = []`.

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `target` |
| `roles.cause` | All filled peers of `target` whose value contributes to eliminating any digit ≠ D from `candidates[target]`. Sorted ascending. |
| `roles.elimTarget` | `[]` |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[D]` |
| `unit` | `null` (Naked Single is cell-scoped) |
| `arrows` | One `{ from: peer, to: target, style: 'straight-arrow' }` per element of `roles.cause`. |
| `supportingText` | `"Only *[D]* can go here — all other digits appear in this cell's row, column, or box."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

**Cause-cell selection rule:** A peer is included in `roles.cause` iff it is the *first* peer (in row-major order) that eliminates each non-D digit. This deduplicates the eight peer relationships down to at most eight cells (and usually fewer — most peers eliminate multiple digits at once for Naked Singles). The intent matches fspec §8.1: "typically fewer arrows are needed — only the digits that directly eliminate candidates are shown."

---

### 7.2 Hidden Single (rank 2, Placement)

**Solver step:** `step.cellIndex = target`, `step.digit = D`, `step.eliminations = []`.

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `target` |
| `roles.cause` | All distinct filled cells outside the unit that contain D and directly eliminate a candidate from an empty non-target unit member. Sorted ascending. May be empty if all non-target unit members are filled. |
| `roles.elimTarget` | `[]` |
| `roles.unitMember` | All 9 cells of the unit in which D is hidden, **excluding** `target`. (Length 8.) |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[D]` |
| `unit` | `{ type, index }` of the unit in which D is hidden. |
| `arrows` | One `{ from: causeCell, to: E, style: 'elim-line' }` per (cause, eliminated-cell) pair. For each empty non-target unit member E: check E's column if hiding unit is row or box; check E's row if hiding unit is col or box; check E's box if hiding unit is row or col. (from, to) pairs are deduplicated — when the same cause cell eliminates E via both column and box membership, only one arrow is emitted. |
| `supportingText` | `"*[D]* can only go in one place in this *[row/column/box]*."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

**Unit identification:** When the technique module reports a Hidden Single, the analyzer determines which of the three units (`UNITS_OF[target]`) was the one in which D was hidden by checking, for each unit, whether the other 8 cells all have D eliminated from their candidates (or are filled). The first matching unit wins; tie-breaking follows the order `row, col, box`.

---

### 7.3 Locked Candidates (rank 3, Elimination)

**Solver step:** `step.cellIndex` set to the first elimination target, `step.digit = null`, `step.eliminations` non-empty (each entry's `digit` is the locked digit D).

The technique has two sub-variants — pointing (box → row/col) and claiming (row/col → box) — distinguished by the geometry of the source cluster.

**Mapper output (both variants):**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The "source cluster": the cells in the box (pointing) or the row/col (claiming) where D is confined. These are derivable from `candidates`: cells in the source unit whose candidate set still contains D. |
| `roles.elimTarget` | All cells appearing in `step.eliminations` (deduplicated). |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[D]` (the single locked digit, taken from `step.eliminations[0].digit`) |
| `unit` | `null` — Locked Candidates spans two interacting units; neither alone defines the move. |
| `arrows` | One `{ from: cause[0], to: elim, style: 'dashed-arrow' }` per elimination target. (Use `cause[0]` as a stable arrow origin; the visual is "from the source cluster to the elim-target," and a single representative source is sufficient.) |
| `supportingText` | Pointing: `"*[D]* in this box is confined to *[row/column]* — eliminate it from the rest of that *[row/column]*."` Claiming: `"*[D]* in this *[row/column]* only appears within this box — eliminate it from the rest of the box."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

**Variant detection:**

- *Pointing:* All cells in `roles.cause` share the same box. The "confined-to" line is the row or column they all share.
- *Claiming:* All cells in `roles.cause` share the same row or column. The "confined-to" box is the box they all share.

The analyzer detects which by inspecting `boxOf`, `rowOf`, `colOf` of the cause cells.

---

### 7.4 Naked Pair (rank 4, Elimination)

**Solver step:** `step.eliminations` non-empty; multiple eliminations possible.

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The two pair cells (cells in the unit whose candidate set is exactly the pair's two-bit mask). Sorted ascending. |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[A, B]` — the two pair digits, ascending. Derived as the two set bits of `candidates[cause[0]]`. |
| `unit` | `{ type, index }` of the unit in which the pair lives. |
| `arrows` | Two arrow entries: 1) `{ from: cause[0], to: cause[1], style: 'bezier-arc' }` (the cause-to-cause arc per vspec §6); 2) for each `e ∈ step.eliminations`, `{ from: cause[0], to: e.cellIndex, style: 'dashed-arrow' }` (the cause-to-elim dashed pointers). |
| `supportingText` | `"These two cells must contain *[A]* and *[B]* — eliminate both from the rest of this *[row/column/box]*."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

**Pair identification:** From the elimination set, the pair-cells share the same unit as every elim target. The cells whose candidate bitset is exactly two bits and whose two-bit value is identical between them, within that unit, are the pair.

---

### 7.5 Hidden Pair (rank 5, Elimination)

**Solver step:** `step.eliminations` is non-empty; eliminations target the *non-pair* candidates within the two pair cells (e.g., removing C, D, E from a cell that should be {A, B}).

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The two hidden-pair cells. |
| `roles.elimTarget` | `[]` — the eliminations happen *within* the cause cells, not in separate elimination cells. The non-pair candidates inside the cause cells are visually de-emphasised by the UI based on the `eliminations` array; no separate `elim-target` role is needed. |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[A, B]` — the two hidden digits, ascending. Derived as the two digits that appear *only* in the cause cells within the unit. |
| `unit` | `{ type, index }` of the unit. |
| `arrows` | `[]` — fspec §8.5 grid visual is "the two cells are highlighted; hidden digits annotated; other candidates de-emphasised." No arrow direction is meaningful. |
| `supportingText` | `"*[A]* and *[B]* can only go in these two cells in this *[row/column/box]* — all other candidates in these cells can be removed."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

---

### 7.6 Naked Triple (rank 6, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The three triple cells (each holds two or three of the three shared digits). Sorted ascending. |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[A, B, C]` ascending — the union of the candidate bits across the three cause cells. |
| `unit` | `{ type, index }`. |
| `arrows` | For each adjacent pair `(cause[i], cause[i+1])` for `i ∈ {0, 1}`, one `{ from, to, style: 'bezier-arc' }`. Plus, for each elim target, one `{ from: cause[0], to: e.cellIndex, style: 'dashed-arrow' }`. |
| `supportingText` | `"These three cells hold only *[A]*, *[B]*, and *[C]* — eliminate those candidates from the rest of this *[row/column/box]*."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

---

### 7.7 Hidden Triple (rank 7, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The three hidden-triple cells. |
| `roles.elimTarget` | `[]` (analogous to Hidden Pair: eliminations target non-triple candidates within cause cells). |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[A, B, C]` ascending. |
| `unit` | `{ type, index }`. |
| `arrows` | `[]`. |
| `supportingText` | `"*[A]*, *[B]*, and *[C]* can only appear in these three cells in this *[row/column/box]* — remove all other candidates from these cells."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

---

### 7.8 X-Wing (rank 8, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The four corner cells, in `[topLeft, topRight, bottomRight, bottomLeft]` order (clockwise from top-left), so the renderer can close the rectangle from the polyline. |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[D]` — the locked digit. |
| `unit` | `null` — X-Wing spans two rows and two columns; no single unit. |
| `arrows` | `[{ points: roles.cause, style: 'connector-chain' }]` — single closed quadrilateral. Plus, optionally, one `{ from: cause[0], to: e.cellIndex, style: 'dashed-arrow' }` per elim target. (The dashed-arrow set may be capped at the renderer's discretion; the analyzer emits one per elim target unconditionally.) |
| `supportingText` | `"*[D]* only appears in these two columns within these two rows — it can't appear elsewhere in those columns."` (When the X-Wing is row-locked instead of column-locked, swap "rows" and "columns" — the analyzer determines orientation by checking whether the cause cells share row indices in pairs (column orientation) vs. column indices in pairs (row orientation).) |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

---

### 7.9 Swordfish (rank 9, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The pattern cells (up to 9). Each cell is in one of the three rows and one of the three columns of the fish. Order: row-major across the three rows, then column-ascending within each row. |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[D]`. |
| `unit` | `null`. |
| `arrows` | One `{ points: [...], style: 'connector-chain' }` whose points are the four "outer corners" of the 3×3 bounding box (top-left, top-right, bottom-right, bottom-left). The full pattern of 9 cells is communicated by the cell highlighting; the connector communicates the rectangle of rows × columns. |
| `supportingText` | `"*[D]* across these three *[rows/columns]* is locked to these three *[columns/rows]* — eliminate it from the rest of those *[columns/rows]*."` Orientation determined identically to X-Wing. |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

---

### 7.10 Jellyfish (rank 10, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | The pattern cells (up to 16). |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[D]`. |
| `unit` | `null`. |
| `arrows` | `[{ points: [tl, tr, br, bl], style: 'connector-chain' }]` — the four outer corners of the 4×4 bounding box. |
| `supportingText` | `"*[D]* across these four *[rows/columns]* is locked to these four *[columns/rows]* — eliminate it from the rest of those *[columns/rows]*."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

---

### 7.11 XY-Wing (rank 11, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | `[hinge, wing1, wing2]` — hinge first, wings ascending. |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA`, `roles.scB` | `[]`, `[]` |
| `digits` | `[Z]` — the eliminated digit. |
| `unit` | `null` — XY-Wing spans up to three units. |
| `arrows` | Two chain edges: `{ from: hinge, to: wing1, style: 'chain-edge', strong: true }` and `{ from: hinge, to: wing2, style: 'chain-edge', strong: true }`. Plus, for each elim target, `{ from: wing1, to: e.cellIndex, style: 'dashed-arrow' }` and `{ from: wing2, to: e.cellIndex, style: 'dashed-arrow' }` (the elim is justified by *both* wings, so both pointers are emitted). |
| `supportingText` | `"One of these two wings must contain *[Z]* — cells seeing both wings can't contain *[Z]*."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

**Hinge identification:** the cause cell with candidates `{X, Y}` whose digits split between the two wings (hinge `{X,Y}`, wing1 `{X,Z}`, wing2 `{Y,Z}`). The hinge is uniquely identifiable from the candidates of the three cause cells reported by the technique module.

---

### 7.12 Simple Coloring (rank 12, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | `[]` — the cause role is split into `scA` and `scB`. |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA` | The "true-poled" cells of the coloring chain. |
| `roles.scB` | The "false-poled" cells. |
| `digits` | `[D]`. |
| `unit` | `null`. |
| `arrows` | One `{ from, to, style: 'chain-edge', strong: true }` per chain edge. The chain-edge list comes from the technique module's chain output. |
| `supportingText` | Rule 2: `"These linked cells must alternate between two values for *[D]*. Two same-color cells see each other — that group can't be *[D]*."` Rule 4: `"These linked cells must alternate between two values for *[D]*. Any cell that sees one cell of each color can't be *[D]*."` The mapper detects the rule by checking whether the elimination targets are chain cells (Rule 2) or uncolored cells outside the chain (Rule 4). |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

**Group A vs. B convention:** Group A is the group containing the lowest-indexed cell in the entire chain. This makes the choice deterministic across runs and makes test fixtures stable.

**Note on technique-module output:** The Simple Coloring technique module must export, alongside the `eliminations`, the chain-cell-to-color mapping. If the v1 module signature does not yet include this, the analyzer cannot infer it from `step.eliminations` alone — the technique module must be extended to expose the chain. This is the only place where the analyzer requires more information from the solver than the current `Step` shape carries. See §12 for the implementation-sequence implication.

---

### 7.13 Multi-Coloring (rank 13, Elimination)

**Mapper output:**

| Field | Value |
|---|---|
| `roles.target` | `null` |
| `roles.cause` | `[]` |
| `roles.elimTarget` | All cells in `step.eliminations`. |
| `roles.unitMember` | `[]` |
| `roles.scA` | All cells from chain 1, irrespective of pole. (Multi-Coloring involves two chains; the analyzer collapses chain identity into the A/B distinction so the same two CSS classes can render the visual.) |
| `roles.scB` | All cells from chain 2. |
| `digits` | `[D]`. |
| `unit` | `null`. |
| `arrows` | One `{ from, to, style: 'chain-edge', strong: true }` per intra-chain edge. Inter-chain relationships are not rendered as arrows — the dual-class colour treatment communicates the interaction. |
| `supportingText` | `"Two separate chains for *[D]* interact. A cell that sees one color from each chain can't be *[D]*."` |
| `complexity` | `{ acknowledged: false, note: null, endpoints: null }` |

**Pole within chain note:** Multi-Coloring's logic depends on cell pole within each chain. The analyzer's CSS-class-driven visual collapses pole information across chains: it shows "chain 1 vs. chain 2," not "true vs. false within chain." This is a deliberate simplification — the supporting text and elim-target highlights communicate the elimination without requiring four colours. fspec §8.13 explicitly accepts this simplification ("simplified — complexity acknowledged" in the supporting-text label).

---

### 7.14 XY-Chain (rank 14, Elimination)

Let `L` be the chain length (number of cells in the chain). Define:

```js
const COMPLEXITY_THRESHOLD = 6;   // module-private constant in analyzer.js
```

**Mapper output:**

| Field | Value | When |
|---|---|---|
| `roles.target` | `null` | always |
| `roles.cause` | The chain cells, in chain order. | always — but see "Long chain" below |
| `roles.elimTarget` | All cells in `step.eliminations`. | always |
| `roles.unitMember`, `roles.scA`, `roles.scB` | `[]`, `[]`, `[]` | always |
| `digits` | `[D]` — the shared endpoint digit. | always |
| `unit` | `null`. | always |
| `arrows` | One `{ from, to, style: 'chain-edge', strong: false }` per chain edge. For long chains (`L > COMPLEXITY_THRESHOLD`), only the two endpoint cells are emitted as cause: arrows then become a single `{ from: endpoints[0], to: endpoints[1], style: 'dashed-arrow' }` connecting the endpoints directly, and the supporting text acknowledges the elision. | shape varies |
| `supportingText` | `"A chain of two-candidate cells passes *[D]* from one end to the other. Cells seeing both ends can't contain *[D]*."` | always |
| `complexity.acknowledged` | `L > COMPLEXITY_THRESHOLD` | conditional |
| `complexity.note` | `"This is a long chain — the highlights show the endpoints. Trace the links yourself to verify."` if acknowledged, else `null`. | conditional |
| `complexity.endpoints` | `[chain[0], chain[L-1]]` | always |

**Long-chain mode rules:**

When `L > COMPLEXITY_THRESHOLD`:
- `roles.cause` contains only the two endpoints.
- `arrows` contains a single endpoint-to-endpoint dashed arrow.
- `complexity.acknowledged = true` and `complexity.note` is set.

When `L ≤ COMPLEXITY_THRESHOLD`:
- `roles.cause` contains all chain cells.
- `arrows` contains one `chain-edge` per chain link.
- `complexity.acknowledged = false`.

The threshold is tunable; `6` is the analyzer's default. The UI spec must not fork its own threshold — the analyzer is authoritative for what data the UI receives.

---

### 7.15 Forcing Chain (AIC) (rank 15, Elimination)

**Mapper output:** Same shape as XY-Chain except:

- `complexity.acknowledged = true` *unconditionally* (per fspec §8.15 — "Complexity acknowledgment applies (always, by policy for this technique)").
- `complexity.note` = `"This technique involves a long chain of forced inferences. The highlighted cells show where to start and what the conclusion is. Working through the full chain is an advanced exercise."`
- `roles.cause` always contains only the AIC endpoints (and, when `L ≤ COMPLEXITY_THRESHOLD`, the interior cells too).
- `supportingText` = `"An alternating chain of strong and weak links forces *[D]* into (or out of) *[target cell ref]*."` `[target cell ref]` is the chain's target cell, formatted as `"row R, column C"` from the elimination's `cellIndex`.
- `arrows`: `chain-edge` entries with `strong: true` for strong links and `strong: false` for weak links, derived from the technique-module chain output. For long chains, see XY-Chain elision.

---

### 7.16 Cross-Technique Field Quick-Reference

| Rank | Name | `target` | `cause` size | `elimTarget` | `unitMember` | `scA`/`scB` | `unit` | `arrows` style |
|---:|---|---|---:|---|---|---|---|---|
| 1 | Naked Single | non-null | ≥0 | `[]` | `[]` | `[]` | `null` | straight-arrow |
| 2 | Hidden Single | non-null | `[]` | `[]` | 8 | `[]` | set | none |
| 3 | Locked Candidates | `null` | ≥1 | ≥1 | `[]` | `[]` | `null` | dashed-arrow |
| 4 | Naked Pair | `null` | 2 | ≥1 | `[]` | `[]` | set | bezier-arc + dashed |
| 5 | Hidden Pair | `null` | 2 | `[]` | `[]` | `[]` | set | none |
| 6 | Naked Triple | `null` | 3 | ≥1 | `[]` | `[]` | set | bezier-arc + dashed |
| 7 | Hidden Triple | `null` | 3 | `[]` | `[]` | `[]` | set | none |
| 8 | X-Wing | `null` | 4 | ≥1 | `[]` | `[]` | `null` | connector-chain + dashed |
| 9 | Swordfish | `null` | ≤9 | ≥1 | `[]` | `[]` | `null` | connector-chain |
| 10 | Jellyfish | `null` | ≤16 | ≥1 | `[]` | `[]` | `null` | connector-chain |
| 11 | XY-Wing | `null` | 3 | ≥1 | `[]` | `[]` | `null` | chain-edge + dashed |
| 12 | Simple Coloring | `null` | `[]` | ≥1 | `[]` | non-empty/non-empty | `null` | chain-edge |
| 13 | Multi-Coloring | `null` | `[]` | ≥1 | `[]` | non-empty/non-empty | `null` | chain-edge |
| 14 | XY-Chain | `null` | varies (L or 2) | ≥1 | `[]` | `[]` | `null` | chain-edge or dashed |
| 15 | Forcing Chain | `null` | varies | ≥1 | `[]` | `[]` | `null` | chain-edge |

This table is informative; the per-technique sub-sections above are normative.

---

## 8. Auto-Reveal Payload Construction

Per fspec §6.3, auto-reveal applies to *all* cells the explanation references — not just primary coached cells.

The driver builds `autoReveal.cells` by:

```js
function buildAutoReveal(roles, candidates, rank) {
  const required = rank >= 3;
  const all = new Set();
  if (roles.target !== null) all.add(roles.target);
  for (const c of roles.cause)        all.add(c);
  for (const c of roles.elimTarget)   all.add(c);
  for (const c of roles.unitMember)   all.add(c);
  for (const c of roles.scA)          all.add(c);
  for (const c of roles.scB)          all.add(c);
  const sorted = [...all].sort((a, b) => a - b);
  return {
    required,
    cells: sorted.map(i => ({ cellIndex: i, candidates: candidates[i] })),
  };
}
```

Notes:

1. The set unions deduplicate cells that appear in multiple roles (rare, but possible).
2. Sorting ascending by `cellIndex` is purely for test stability.
3. `candidates[i]` is taken from the (possibly pencil-intersected) `candidates` array passed to the mapper (§6.3). When no pencil was provided, this equals `initialCandidates(workingBoard)` directly. Either way, the UI receives the candidate set that the analyzer actually used — consistent with whatever was intersected.
4. For ranks 1–2, `required` is `false` but `cells` is still populated. The UI spec may render or not render based on `required`. Including the data unconditionally keeps the schema uniform; ranks 1–2 callers simply ignore it.
5. **`autoReveal.cells` and the COACH_START filter:** the `COACH_START` reducer in `aspec-coach-ui.md` §3.1 applies auto-reveal only where the revealed bits would add something new (`after & ~before !== 0`). The analyzer does not need to pre-filter `autoReveal.cells` for this — the reducer's `coachRevealedBits` computation handles it by only recording the delta. The analyzer emits the full candidate set for every referenced cell; the reducer is the filter. No change is needed here.

---

## 9. Null / No-Technique Case

When `solveLogically(workingBoard).trace` is empty, `analyze()` must communicate one of three sub-states:

1. **Puzzle complete** — every cell of `workingBoard` is non-zero.
2. **Inconsistent board** — the working board has empty cells but the solver could not progress (no technique applies).
3. **Solver-not-required win** — the working board is fully filled and matches `puzzle.solution` (degenerate case of complete).

Per the task brief, two return-shape options exist: bare `null` (caller infers from `GameState`) or a structured `{ type, reason }` object.

**Decision: structured return.** `analyze()` returns either a `CoachStep` *or* a `NoTechniqueResult`:

```js
NoTechniqueResult = {
  type: 'no-technique',
  reason: 'complete' | 'error' | 'inconsistent',
}
```

The choice resolves the open option in favour of clarity at the seam. Rationale:

- The UI spec needs the reason to choose between fspec §4.2's three status messages ("The puzzle is already solved.", "The board has an error. Use Check or Erase to fix it before coaching.", "The board has a contradiction. Use Erase to fix it."). Re-deriving this from `GameState` would force the UI module to duplicate the analyzer's logic. Keeping it in the analyzer is single-source.
- The structured return is trivially distinguishable from a `CoachStep` (`step.type === 'no-technique'` vs. `'placement' | 'elimination'`), so callers do not need to type-test multiple shapes.
- Returning `null` would have been simpler but punts a load-bearing decision to the UI layer.

The analyzer signature is therefore:

```js
export function analyze(puzzle, playerState) → CoachStep | NoTechniqueResult
```

The function never returns bare `null`. The "or null" in §2 is replaced by "or `NoTechniqueResult`."

### 9.1 `reason` Determination

`'error'` is checked **before** the solver runs, as a pre-flight guard. `'complete'` and `'inconsistent'` are determined afterward from the solver result.

**Pre-solver error check:**

```js
// Before buildWorkingBoard / solveLogically:

// 1. Any visible conflict blocks coaching immediately.
if (playerState.conflicts.size > 0) {
  return { type: 'no-technique', reason: 'error' };
}

// 2. Detect non-conflicting wrong pen entries (invisible to the player as conflicts).
for (let i = 0; i < 81; i++) {
  if (puzzle.givens[i] !== 0) continue;         // given cell — not the player's entry
  if (playerState.pen[i] === 0) continue;        // no pen entry
  if (playerState.pen[i] !== puzzle.solution[i]) {
    return { type: 'no-technique', reason: 'error' };
  }
}
```

Two categories of board error must be caught before the solver runs:

**Conflicting entries** (`playerState.conflicts.size > 0`) — two cells in the same unit hold the same digit. `buildWorkingBoard` excludes conflicted cells by design, but this creates a subtler hazard: a *correct* cell that happens to share a digit with a wrong cell in the same unit is also dragged into the conflict set and excluded from the working board. The solver would then reason about a board with correct values missing, and can produce misleading advice. The simplest and most correct response is to refuse coaching entirely whenever any conflict exists. The player is told there is an error, and coaching does not proceed.

**Non-conflicting wrong entries** — a wrong digit that does not share a unit with the same digit elsewhere is not flagged by conflict detection and is therefore not visible to the player as an error highlight. If `buildWorkingBoard` were allowed to include it, the solver would operate on a corrupted board and could return misleading technique suggestions. This check catches that case before the solver runs.

**Pencil mark asymmetry** — only pen entries are validated against the solution. Pencil marks are not. Specifically, pencil *erasures* — cases where the user has manually removed a candidate from a cell's pencil marks — are accepted as authoritative eliminations and reflected in the intersected candidate set (§4.2). This is intentional:

- *Why erasures must be trusted.* If the coach did not respect pencil erasures, it would re-suggest the same elimination technique on every invocation after the user applies it, because the working board hasn't changed (only the pencil state has). Trusting erasures is what allows the coach to advance past elimination steps.
- *The accepted risk.* If a user incorrectly erases a correct candidate, the solver sees a restricted candidate set that may produce a false pattern. This is a known limitation. The primary source of pencil state is the coach's own `autoReveal`, which writes logically correct marks; manual erasure is the realistic path to corruption, and is a deliberate user action.
- *Pencil additions are harmless.* The intersection (`candidates[i] &= pencil[i]`) can only restrict the logical set, never expand it. A pencil mark on a logically-impossible digit is silently filtered out.

**Post-solver reason determination** (unchanged):

```js
function buildNullStep(workingBoard) {
  const allFilled = workingBoard.every(v => v !== 0);
  if (allFilled) {
    return { type: 'no-technique', reason: 'complete' };
  }
  return { type: 'no-technique', reason: 'inconsistent' };
}
```

A fully-filled working board is treated as `'complete'` regardless of correctness. The win-detection path elsewhere in the system handles incorrect-but-full boards via `ON_COMPLETION_EVALUATE` (`aspec-game-state.md` §5).

If `allFilled` is false and the solver returned an empty trace, the board is genuinely stuck (no technique applies) — `'inconsistent'`.

---

## 10. Data Handoff to `CoachSession`

The analyzer is the data-producer; the UI spec defines a `CoachSession` slice on `GameState` that consumes it. This section sets the contract that `aspec-coach-ui.md` must honour.

### 10.1 Handoff Contract

The analyzer's return value (`CoachStep | NoTechniqueResult`) becomes the initial value of a field within the UI's `CoachSession` slice. The UI spec is free to name the slice field, wrap the value, or store it transformed, with one constraint:

> **The `CoachStep` object returned by `analyze()` must be storable as-is.** The UI layer must not mutate any field of `CoachStep` it receives. If the UI needs derived state (e.g., "currently focused coached cell"), that derived state must live in adjacent fields, not by mutating `CoachStep`.

Rationale: the analyzer is pure. Mutating its output would break the property that "calling `analyze` twice on the same input returns equivalent data." Storing the value verbatim also means re-renders need only consult `CoachStep` and current focus state; the derivation pipeline is one-shot.

### 10.2 Suggested Slice Shape (Non-Binding)

For the UI spec author's convenience, the following slice shape would consume the analyzer's output cleanly:

```js
CoachSession = {
  active: bool,                        // true iff a coach session is open
  step: CoachStep | null,              // the analyzer's return value, or null when no session
  focusedCoachedCell: int | null,      // which coached cell the user has focused
  pencilSnapshot: Uint16Array(81) | null,  // for revert per fspec §6.4 / §2.3
  recap: 'normal' | 'error' | null,    // post-fill recap variant; null when not in recap
} | null
```

The UI spec is the binding source on this; the above is illustrative.

### 10.3 What the UI Spec Must Not Modify

- The `CoachStep` schema (§3) — sealed.
- `analyze()`'s signature (§4) — sealed.
- The working-board rule (§5) — must match the hint provider's rule verbatim.
- The `NoTechniqueResult` shape (§9) — sealed.

---

## 11. Directory Tree Delta

The following additions to `aspec-overview.md` §3 are required when this spec is approved:

```
js/
├── coach/
│   └── analyzer.js                    # NEW — pure-function module per this spec
└── tests/
    └── unit/
        └── coach/
            └── analyzer.test.js        # NEW — per-technique unit tests (§13)
            # fixtures live under js/tests/fixtures/puzzles/coach/ — see §13
```

No other files are added by this spec. (The Coach Mode UI module path — likely `js/ui/coach.js` or `js/coach/ui.js` — is the UI spec's responsibility.)

The feature spec index in `aspec-overview.md` §11 also needs a new row:

| File | Contents | Loaded by |
|---|---|---|
| `aspec-coach-analyzer.md` | Coach Mode analyzer module — pure function returning a CoachStep describing the next coachable move | Implementor (Phase 8), Reviewer, QE |

(A future row for `aspec-coach-ui.md` will be added when that spec is approved.)

---

## 12. Implementation Sequence

This module belongs to a new **Phase 8 — Coach Mode**, sequenced after Phase 7 (Polish and validation) of `aspec-overview.md` §8. The detailed sub-sequence:

**Phase 8a — Analyzer (this spec)**

1. Extend the three solver files that the audit (completed 2026-05-04) confirmed require additive changes. All extensions are purely additive — no existing callers break. Complete these before implementing any mapper.

   **`js/solver/techniques/coloring.js`**

   `buildChains` already computes the full chain/pole structure internally but does not return it. Add:
   - `simpleColoring` return: add `colorChain: { digit: int, groupA: int[], groupB: int[] }` where `groupA` = color-0 cells, `groupB` = color-1 cells.
   - `multiColoring` return: add `colorChains: Array<{ digit: int, groupA: int[], groupB: int[] }>` — one entry per interacting chain.

   **`js/solver/techniques/forcingChains.js`**

   `xyChainDFS` tracks `path` (ordered `number[]`) and `z` (elimination digit) at return time but drops both. `aicSearch` tracks `path` (`Array<{cell,digit,strong}>`) but drops it too. Add:
   - `xyChain` return: add `chain: { cells: [...path, next], digit: z }` — ordered cell indices; endpoints are `cells[0]` and `cells[last]`.
   - `forcingChain` return: add `chain: { nodes: path }` — ordered `{cell, digit, strong}` entries.
   - **Bug fix (type-1 AIC loop closure):** at the `aicSearch` type-1 (closed-loop) return site, the final closing node (`next`) is not appended to `path` before the function returns. Append it before constructing `chain.nodes`, otherwise the chain is one node short.

   **`js/solver/logical.js`**

   `logical.js` currently projects only the four base `Step` fields. Any `colorChain`, `colorChains`, or `chain` fields on technique results are silently dropped here and never reach the analyzer. Add a pass-through: when assembling a `Step` for a technique result, spread (or explicitly copy) the optional chain fields if present. The `Step` type definition in `aspec-solver.md` §6 documents the full extended shape.
2. Implement the working-board builder, the per-technique mappers, the auto-reveal builder, and the null-case builder.
3. Implement the `analyze()` driver.
4. Write unit tests per §13.

**Phase 8b — Coach UI** (deferred to `aspec-coach-ui.md`).

The phase ordering is significant: the analyzer is implementable and testable independently. The UI spec cannot proceed until the analyzer's `CoachStep` schema is sealed (this spec's purpose), but its implementation can be deferred until the analyzer ships green tests.

### 12.1 Build-Order Risks

- **Solver extension risk (assessed).** Pre-implementation audit (2026-05-04) confirmed all three required extensions (`coloring.js`, `forcingChains.js`, `logical.js`) are purely additive. No restructuring is needed; no existing callers break. The audit also found a one-node bug in `aicSearch`'s type-1 AIC loop-closure path (see §12 step 1 for the fix). The risk of a spec-reopening non-additive change is resolved.
- **Test fixture availability.** Per-technique fixture boards must exist for every rank (see §13). The Phase 2 test infrastructure (`js/tests/fixtures/puzzles/`) already contains technique fixtures used by `aspec-techniques.md` testing; the analyzer can reuse those fixtures. New fixtures may be added under `js/tests/fixtures/puzzles/coach/` if a technique fixture for rank N produces a board where rank M < N also applies — the analyzer would prefer rank M (the easier move), and the test would be testing the wrong technique. Coach-specific fixtures avoid this by guaranteeing rank N is the *easiest* applicable technique on the fixture board.

---

## 13. Test Strategy

### 13.1 Test File

```
js/tests/unit/coach/analyzer.test.js
```

Single Mocha test file covering all 15 techniques plus the no-technique cases. May be split into a directory of files per technique if it grows past ~600 lines; the directory split mirrors `js/tests/unit/techniques/`.

### 13.2 Fixture Boards

Fixtures live under `js/tests/fixtures/puzzles/coach/` — one fixture per rank, named `rank-NN-<technique>.json`. Each fixture is a JSON document:

```json
{
  "givens": "...81-character digit string with 0 for empty...",
  "playerPen": "...optional 81-character digit string layered on top of givens...",
  "solution": "...81-character digit string...",
  "expected": {
    "technique": "Naked Pair",
    "rank": 4,
    "type": "elimination",
    "roles": { "...full expected roles..." },
    "digits": [3, 7],
    "unit": { "type": "row", "index": 4 },
    "eliminations": [ { "cellIndex": 38, "digit": 3 } ],
    "supportingText": "These two cells must contain *3* and *7* — eliminate both from the rest of this *row*.",
    "autoRevealRequired": true,
    "complexityAcknowledged": false
  }
}
```

A fixture board must satisfy the property that **rank N is the lowest-ranked technique applicable** on the working board built from `givens + playerPen`. Test fixtures with rank-bleed (rank 4 fixture where rank 1 also applies) are invalid for analyzer testing — the analyzer would correctly return rank 1 in that case.

### 13.3 Test Cases (Per Technique)

For each rank 1–15:

1. **Happy path.** Load fixture, call `analyze`, assert every field of the returned `CoachStep` matches expectations.
2. **Conflict blocks coaching.** Construct a fixture where the player has placed any digit in an empty cell and added that cell to `playerState.conflicts`. Assert the analyzer returns `{ type: 'no-technique', reason: 'error' }` immediately, without proceeding to the solver.
3. **Pencil-mark independence (no pencil provided).** Call `analyze` without a `pencil` argument. Assert the returned `autoReveal.cells[*].candidates` matches what `initialCandidates(workingBoard)` produces.
4. **Pencil intersection — technique suppressed.** For a rank-3 (Locked Candidates) fixture, clear all elimination-target bits from `playerState.pencil` for the relevant cells, then call `analyze` with `pencil`. Assert the result is either a higher-rank technique or `NoTechniqueResult` — the Locked Candidates step does not fire.
5. **Pencil intersection — partial marks.** For the same fixture, clear only some (not all) elimination-target bits. Assert that Locked Candidates still fires (remaining candidates are still present).
6. **Pencil-absent cells (pencil[i] === 0).** Provide a `pencil` array where some referenced cells have `pencil[i] = 0`. Assert those cells' candidates are not restricted (full logical candidates remain).

### 13.4 Test Cases (Cross-Cutting)

1. **No-technique — complete.** Fixture: a fully-solved board. Assert `analyze` returns `{ type: 'no-technique', reason: 'complete' }`.
2. **No-technique — inconsistent.** Fixture: a board with empty cells where no technique applies (use a board that requires beyond-rank-15 logic). Assert `{ type: 'no-technique', reason: 'inconsistent' }`.
2b. **No-technique — error (non-conflicting wrong digit).** Construct a minimal puzzle where `solution[i] = X` and `playerState.pen[i] = Y` (Y ≠ X, not in conflicts). Assert `{ type: 'no-technique', reason: 'error' }`.
2c. **No-technique — error when conflicted.** Same setup as 2b but add cell `i` to `playerState.conflicts`. Assert the result is `{ type: 'no-technique', reason: 'error' }` — any non-empty conflicts set blocks coaching before the solver runs.
3. **Purity.** Call `analyze` twice on the same input. Assert deep equality of the two return values, and assert neither input was mutated (compare `Uint8Array` byte-by-byte).
4. **Schema completeness.** For every fixture, assert every field listed in §3 is present on the returned `CoachStep` (no `undefined`s).
5. **Long-chain elision (rank 14).** Provide a fixture whose XY-Chain length exceeds `COMPLEXITY_THRESHOLD`. Assert `complexity.acknowledged === true`, `roles.cause.length === 2`, `arrows.length === 1`, and `arrows[0].style === 'dashed-arrow'`.
6. **Forcing Chain always-acknowledged (rank 15).** Provide a short Forcing Chain fixture. Assert `complexity.acknowledged === true` regardless of length.

### 13.5 Coverage Target

Per `aspec-overview.md` §7.2 — 100 % branch coverage. Mappers contain branchy code (variant detection in Locked Candidates, orientation detection in X-Wing/Swordfish/Jellyfish, length threshold in XY-Chain). Each branch must be exercised by at least one fixture.

### 13.6 No DOM Tests

Because the analyzer is DOM-free, no Playwright integration test is required at this layer. The Coach Mode integration tests (Coach button → analyzer → UI rendering) belong to `aspec-coach-ui.md`'s test section.

---

## 14. Non-Goals and Boundaries

The analyzer explicitly does not:

- **Render anything.** No CSS classes are applied here; only role assignments are returned. The UI module maps `roles.cause` → `.coached-cause`, etc. (per vspec §4).
- **Manage session state.** Whether a coach session is "active" is the UI's concern.
- **Modify pencil marks.** The analyzer only *reports* what candidates should be revealed. The UI is responsible for snapshot-and-restore.
- **Decrement budgets.** Coach has no per-puzzle budget (fspec §3.1, §11). Even if a budget were added later, the analyzer would not enforce it — it would be a pre-call check in the UI.
- **Pick alternate moves on user request.** "Coach pressed twice in one session" is a UI concern: the UI may discard the prior `CoachStep` and call `analyze` again, but the analyzer is stateless across calls.
- **Integrate with `hintProvider`.** The two providers share only the working-board rule. They do not call each other and do not share return types.
- **Speak to themes.** The accent colour, panel chrome, and arrow stroke colours are vspec concerns. The analyzer returns indices and strings only.

---

### Critical Files for Implementation
- /home/brc/Documents/websites/sudoku/js/coach/analyzer.js (new — the module this spec defines)
- /home/brc/Documents/websites/sudoku/js/solver/logical.js (must be extended to pass chain fields through to Step — see §12 step 1)
- /home/brc/Documents/websites/sudoku/js/solver/candidates.js (consumed via `initialCandidates`)
- /home/brc/Documents/websites/sudoku/js/solver/techniques/coloring.js (must expose `colorChain`/`colorChains` — see §12 step 1)
- /home/brc/Documents/websites/sudoku/js/solver/techniques/forcingChains.js (must expose `chain`; fix AIC loop-closure bug — see §12 step 1)
