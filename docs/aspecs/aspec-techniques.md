# Architectural Spec — Technique Ladder
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 2), QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — for the master directory tree and cross-cutting conventions.
> **Also load:** `aspec-solver.md` (§6) — `solveLogically` consumes `TECHNIQUES[]`; understand the driver before implementing individual techniques.

---

## Table of Contents

1. [Technique Module Contract](#1-technique-module-contract)
2. [TECHNIQUES[] Ordered Array](#2-techniques-ordered-array)
3. [Tier → Technique Map](#3-tier--technique-map)
4. [Technique Definitions](#4-technique-definitions)
5. [Elimination-Only Techniques and the Trace](#5-elimination-only-techniques-and-the-trace)
6. [Rank-to-Tier Function](#6-rank-to-tier-function)
7. [Technique Test Policy](#7-technique-test-policy)

---

## 1. Technique Module Contract

Each technique module in `js/solver/techniques/` exports a pure function:

```js
export default function technique(state) {
  // Returns { placements, eliminations, technique } on first progress, or null.
}
```

- `state = { board: Uint8Array(81), candidates: Uint16Array(81) }`
- Return shape: `{ placements: [{ cellIndex: int, digit: int }], eliminations: [{ cellIndex: int, digit: int }], technique: string } | null`
- `null` means the technique found no progress on the current board state.
- Returns on the **first** progress found; the driver (`solveLogically`) re-enters from the top of the ladder after each return.
- Techniques are pure: they do not mutate `state`. The driver applies the returned result.

---

## 2. TECHNIQUES[] Ordered Array

`js/solver/techniques/index.js` exports the ordered array:

```js
TECHNIQUES = [
  nakedSingle,        // rank 1
  hiddenSingle,       // rank 2
  lockedCandidates,   // rank 3
  nakedPair,          // rank 4
  hiddenPair,         // rank 5
  nakedTriple,        // rank 6
  hiddenTriple,       // rank 7
  xWing,              // rank 8
  swordfish,          // rank 9
  jellyfish,          // rank 10
  xyWing,             // rank 11
  simpleColoring,     // rank 12
  multiColoring,      // rank 13
  xyChain,            // rank 14
  forcingChain,       // rank 15
];
```

Rank is 1-based (matching `hardestRank` in the solver trace). Array index is rank minus 1.

---

## 3. Tier → Technique Map

| Tier | Requires hardest rank | Techniques permitted |
|---|---|---|
| Kiddie | 1 | Naked Single |
| Easy | 2 | + Hidden Single |
| Medium | 3–7 | + Locked Candidates, Naked Pair, Hidden Pair, Naked Triple, Hidden Triple |
| Hard | 8–11 | + X-Wing, Swordfish, Jellyfish, XY-Wing |
| Death March | 12–15 | + Simple Coloring, Multi-Coloring, XY-Chain, Forcing Chain (AIC) |

Naked/hidden quads are not implemented in v1.

---

## 4. Technique Definitions

All techniques implemented clean-room from SudokuWiki prose descriptions. No line-level reference to GPL code.

Each entry: rank, name, SudokuWiki reference, pattern.

1. **Naked Single** — Single-candidate cell. sudokuwiki.org/Getting_Started
2. **Hidden Single** — In a unit, a digit has exactly one candidate cell. sudokuwiki.org/Hidden_Candidates
3. **Locked Candidates** — Pointing + claiming; candidates confined to one row/col within a box eliminate from the rest of that row/col. sudokuwiki.org/Intersection_Removal
4. **Naked Pair** — Two cells in a unit with the same two candidates. sudokuwiki.org/Naked_Candidates
5. **Hidden Pair** — Two digits whose only candidate cells in a unit are the same two cells. sudokuwiki.org/Hidden_Candidates
6. **Naked Triple** — Three cells in a unit sharing three candidates total. sudokuwiki.org/Naked_Candidates
7. **Hidden Triple** — Three digits confined to the same three cells in a unit. sudokuwiki.org/Hidden_Candidates
8. **X-Wing** — Digit D confined to same two columns in two rows; eliminate from rest of those columns. sudokuwiki.org/X_Wing_Strategy
9. **Swordfish** — 3×3 fish. sudokuwiki.org/Sword_Fish_Strategy
10. **Jellyfish** — 4×4 fish. sudokuwiki.org/Jelly_Fish_Strategy
11. **XY-Wing** — Three bivalue cells (XY hinge, XZ and YZ wings); eliminate Z from cells seeing both wings. sudokuwiki.org/Y_Wing_Strategy
12. **Simple Coloring** — Bilocation chain; two same-colored cells that see each other make the color false. sudokuwiki.org/Singles_Chains
13. **Multi-Coloring** — Multiple colored chains interacting. sudokuwiki.org/Colors_Strategies
14. **XY-Chain** — Chain of bivalue cells alternating on a shared digit. sudokuwiki.org/XY_Chains
15. **Forcing Chain (AIC)** — Alternating Inference Chain combining strong/weak links. sudokuwiki.org/Alternating_Inference_Chains

Each technique module signature (repeated from §1 for module-level reference):
```js
export default function technique(state) {
  // Returns { placements, eliminations, technique } on first progress, or null.
}
```

---

## 5. Elimination-Only Techniques and the Trace

Techniques from rank 3 upward often produce only eliminations (no placement). The trace records them with `digit: null` in the `Step` object. The outer solver loop restarts from rank 0 where simpler techniques frequently fire against the reduced candidates.

---

## 6. Rank-to-Tier Function

Defined and exported from `js/solver/logical.js` (see `aspec-solver.md §6`). Imported by `generator/rater.js` to convert the solver's `hardestRank` to a difficulty tier:

```js
export function tierForRank(rank) {
  if (rank === 0)  return null;
  if (rank <= 1)   return 'kiddie';
  if (rank <= 2)   return 'easy';
  if (rank <= 7)   return 'medium';
  if (rank <= 11)  return 'hard';
  if (rank <= 15)  return 'death-march';
  return 'beyond-death-march';
}
```

`rank === 0` means the solver made no progress (puzzle was already solved or is unsolvable by logical means). `'beyond-death-march'` is returned when the puzzle required techniques beyond rank 15; the generator pipeline rejects these and retries.

---

## 7. Technique Test Policy

Every technique has a dedicated test file in `js/tests/unit/techniques/` with:
- At least three curated positions from SudokuWiki examples where the technique finds progress.
- At least one position where the technique returns null (no applicable pattern found — verifies the guard condition).

Positions stored as fixtures under `js/tests/fixtures/techniques/`.
