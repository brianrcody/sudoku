# Architectural Spec — Solver Primitives and Logical Solver
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 1–2), QE Test Writer, QE Test Runner. Also load when implementing the hint provider (Phase 5) since `hintProvider.js` drives `solveLogically` directly.

> **Also load:** `aspec-overview.md` — for the master directory tree and cross-cutting conventions.
> **Also load:** `aspec-techniques.md` — the TECHNIQUES[] array and technique contracts are consumed by `solveLogically`.

---

## Table of Contents

1. [Grid Utilities — `js/util/grid.js`](#1-grid-utilities--jsutilgridjs)
2. [Event Emitter — `js/util/events.js`](#2-event-emitter--jsutileventjs)
3. [Bitset Utilities — `js/util/bitset.js`](#3-bitset-utilities--jsutilbitsetjs)
4. [Uniqueness Solver — `js/solver/uniqueness.js`](#4-uniqueness-solver--jssolveruniquenessjs)
5. [Candidates — `js/solver/candidates.js`](#5-candidates--jsservercandidatesjs)
6. [Logical Solver — `js/solver/logical.js`](#6-logical-solver--jssolverlogicaljs)
7. [Key Algorithms](#7-key-algorithms)
8. [Test Determinism](#8-test-determinism)

---

## 1. Grid Utilities — `js/util/grid.js`

Exports index helpers and precomputed unit/peer tables used throughout the solver, generator, and hint provider.

- `rowOf(i) → int` — row index (0–8) for cell index `i`.
- `colOf(i) → int` — column index (0–8) for cell index `i`.
- `boxOf(i) → int` — box index (0–8) for cell index `i`.
- `cellIndex(r, c) → int` — cell index for row `r`, column `c`.
- `PEERS[i]` — precomputed length-20 array of the 20 peer cell indices for cell `i` (cells sharing a row, column, or box, excluding `i` itself).
- `UNITS` — 27 length-9 arrays: 9 rows + 9 cols + 9 boxes, each containing the 9 cell indices in that unit.
- `UNITS_OF[i]` — length-3 array of the 3 units that cell `i` belongs to (one row unit, one col unit, one box unit).

---

## 2. Event Emitter — `js/util/events.js`

Tiny typed event emitter used by `GameState` and `Statistics` to expose subscription surfaces without leaking their internal `emit` calls. Exports a single factory:

```js
createEmitter() → {
  on(type: string, listener: (payload: any) => void) → () => void,
  off(type: string, listener: Function) → void,
  emit(type: string, payload?: any) → void,
  clear(type?: string) → void,   // clear one type, or all types if omitted
}
```

Behavioral semantics:
- `on` returns an unsubscribe function. Calling it more than once is a no-op.
- `emit` invokes listeners synchronously in registration order with a single `payload` argument.
- Listeners added during an `emit` call do **not** fire for the in-flight emission.
- Listeners removed during an `emit` call (including via their own returned unsubscribe) do not fire for the remainder of the in-flight emission if they have not yet been called.
- Re-entrant `emit` calls from within a listener are allowed and run to completion before the outer `emit` resumes.
- If a listener throws, the error is caught, logged via `console.error`, and remaining listeners for that emission still fire. The error does not propagate out of `emit`.
- Emitting to a type with no listeners is a no-op; unknown types are not errors.

Consumers that wish to expose `.on`/`.off` on their own object (e.g. `GameState`, `Statistics`) compose by holding an emitter instance internally and delegating:

```js
const e = createEmitter();
return { ...api, on: e.on, off: e.off };  // emit stays private to the owner
```

---

## 3. Bitset Utilities — `js/util/bitset.js`

9-bit candidate set helpers over plain JS numbers (bit 1 = digit 1, bit 9 = digit 9):

- `has(set, digit) → bool`
- `add(set, digit) → set`
- `remove(set, digit) → set`
- `count(set) → int` — popcount of set bits
- `iterate(set) → int[]` — digits present in set, in ascending order
- `fromDigits(arr) → set` — construct bitset from array of digits
- `ALL = 0b111111111` — all 9 digits set

---

## 4. Uniqueness Solver — `js/solver/uniqueness.js`

Norvig-style constraint-propagation solver. Used exclusively for uniqueness checking during puzzle generation — not used for logical solving or hints.

One public function:
```js
countSolutions(givens: Uint8Array(81), cap = 2) → { count: int, solution: Uint8Array(81) | null }
```

- Returns `count` of 0, 1, or 2+ (stops counting at `cap`).
- If `count === 1`, `solution` contains the 81-cell solved grid as `Uint8Array`.
- If `count !== 1`, `solution` is `null`.

**Algorithm:**
1. Initialize `candidates[i]` = ALL (digits 1–9) for all cells.
2. For each filled cell in `givens`, call `assign(i, v)`. `assign` returns false immediately if `v` is not currently in `candidates[i]`. Otherwise, it calls `eliminate(i, dd)` for each `dd ≠ v` that is currently a candidate of cell `i`. `eliminate` propagates two constraints recursively: (a) if a cell is reduced to one candidate, assign it; (b) if a digit has only one possible cell left in any unit, assign it there. Returns false on contradiction.
3. If propagation detects a contradiction, return 0 solutions.
4. If all cells are filled, record the solution and return.
5. Otherwise, pick the unfilled cell with fewest candidates (MRV) and try each candidate, recursively. Stop when `count` reaches `cap` (2).

`UNITS_OF_CELL` is a module-private precomputed array (`[row, col, box]` unit lists per cell) used by `eliminate` for hidden-single propagation. It is computed locally within `uniqueness.js` to avoid a circular import from `grid.js`.

Implementation target: ~250 lines. Solves any Sudoku in well under 10 ms in JS.

---

## 5. Candidates — `js/solver/candidates.js`

- `initialCandidates(board: Uint8Array(81)) → Uint16Array(81)` — computes the initial bitset of candidates for each cell by eliminating digits already placed in each cell's peers. Returns a `Uint16Array` where each entry is a 9-bit candidate set.
- `applyPlacement(candidates: Uint16Array(81), cellIndex: int, digit: int) → void` — sets `candidates[cellIndex]` to the single-bit mask for `digit`, then removes `digit` from every peer's candidate set. Mutates `candidates` in place.
- `applyElimination(candidates: Uint16Array(81), cellIndex: int, digit: int) → void` — removes `digit` from `candidates[cellIndex]`. Mutates `candidates` in place.

---

## 6. Logical Solver — `js/solver/logical.js`

Drives the technique ladder to solve a puzzle using only human-applicable techniques. Returns a structured trace for difficulty rating and hint derivation.

```js
solveLogically(board: Uint8Array(81), { techniqueLimit?: int }) →
  { solved: bool, board: Uint8Array(81), candidates: Uint16Array(81), trace: Step[], hardestRank: int }
```

- `techniqueLimit` — optional cap (1-based). Only techniques whose 1-based rank is ≤ `techniqueLimit` are tried. `techniqueLimit=1` allows only the rank-1 technique; defaults to `Infinity` (all techniques). Used by the rater to check "is this puzzle solvable by tier T?"
- `Step = { cellIndex: int, digit: int | null, technique: string, eliminations: [{ cellIndex: int, digit: int }] }` — `eliminations` is always present (empty array for placement steps, populated for elimination-only steps).
- `hardestRank` — the highest 1-based rank technique that was required to make progress (0 if no technique was needed).

Exports:
- `solveLogically` — see above.
- `tierForRank(rank: int) → string | null` — maps a `hardestRank` value to a difficulty tier string. Returns `null` for rank 0 (trivial/no technique needed). Thresholds: ≤1 → `'kiddie'`, ≤2 → `'easy'`, ≤7 → `'medium'`, ≤11 → `'hard'`, ≤15 → `'death-march'`, >15 → `'beyond-death-march'`.

---

## 7. Key Algorithms

### 7.1 Uniqueness Check (Norvig constraint propagation)

Chosen over DLX: smaller code (~250 lines vs. ~500), integrates naturally with the candidate-bitset representation used elsewhere, solves any Sudoku in well under 10 ms in JS.

See §4 for the full algorithm.

### 7.2 Logical Solver Loop

```js
function solveLogically(board, { techniqueLimit = Infinity }) {
  let candidates = initialCandidates(board);
  const trace = [];
  let hardestRank = 0;
  const limit = Math.min(techniqueLimit, TECHNIQUES.length); // techniqueLimit is 1-based

  while (not fully solved) {
    let progressed = false;
    for (let rank = 0; rank < limit; rank++) {  // rank is 0-based index; 1-based rank = rank+1
      const result = TECHNIQUES[rank]({ board, candidates });
      if (result) {
        // Apply placements and eliminations, push Step(s) to trace.
        hardestRank = Math.max(hardestRank, rank + 1);
        progressed = true;
        break;  // restart from rank 0
      }
    }
    if (!progressed) break;
  }

  return { solved: isFull(board), board, candidates, trace, hardestRank };
}
```

Restart from rank 0 on every progress step so easier techniques always run before harder ones on the transformed board. This is what makes the hardest-rank report accurate.

---

## 8. Test Determinism

All tests that invoke the generator pass an explicit seed; behavior is fully reproducible. Tests for solver modules (`uniqueness.js`, `logical.js`, `candidates.js`) use hand-curated puzzle fixtures from `js/tests/fixtures/` — no randomness involved. This applies to all unit and integration tests in this area.
