# Architectural Spec — Puzzle Generation
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 3–4), QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — for the master directory tree and cross-cutting conventions.
> **Also load:** `aspec-solver.md` — `fillGrid`, `removeCells`, `rater`, and `pipeline` all import from `solver/uniqueness.js`, `solver/logical.js`, and `solver/candidates.js`.
> **Also load:** `aspec-solver.md` (§6) — `tierForRank` is defined in `solver/logical.js` and imported by `rater.js` and `pipeline.js`.

---

## Table of Contents

1. [Filled-Grid Generator — `js/generator/fillGrid.js`](#1-filled-grid-generator--jsgeneratorfillgridjs)
2. [Cell Removal — `js/generator/removeCells.js`](#2-cell-removal--jsgeneratorremovecellsjs)
3. [Difficulty Rater — `js/generator/rater.js`](#3-difficulty-rater--jsgeneratorraterjs)
4. [Pipeline — `js/generator/pipeline.js`](#4-pipeline--jsgeneratorpipelinejs)
5. [Worker Entry — `js/worker/generator.worker.js`](#5-worker-entry--jsworkergeneratorworkerjs)
6. [Worker Protocol — `js/worker/protocol.js`](#6-worker-protocol--jsworkerprotocoljs)
7. [Puzzle Provider Facade — `js/providers/puzzleProvider.js`](#7-puzzle-provider-facade--jsprovidersspuzzleproviderjs)
8. [Client Gen Provider — `js/providers/clientGenProvider.js`](#8-client-gen-provider--jsproviderschientgenproviderjs)
9. [Key Algorithms](#9-key-algorithms)
10. [Generation Pipeline Detail](#10-generation-pipeline-detail)
11. [Worker Protocol Detail](#11-worker-protocol-detail)

---

## 1. Filled-Grid Generator — `js/generator/fillGrid.js`

```js
fillGrid(rng: () => float) → Uint8Array(81)
```

Produces a complete, valid Sudoku solution by random-digit, peer-constrained backtracking:
- Recursively find next empty cell.
- Compute candidate set for that cell (digits not yet in any peer).
- Shuffle candidates with `rng` (using `shuffle` from `prng.js`).
- Try each candidate in shuffled order; backtrack on failure.
- Returns on first success (~1–5 ms).

---

## 2. Cell Removal — `js/generator/removeCells.js`

```js
buildMinimalPuzzle(solution: Uint8Array(81), rng: () => float, targetGivens: { min: int, max: int }) → Uint8Array(81)
```

Produces a puzzle with a unique solution by removing cells from a complete grid:
1. Shuffle all 81 cell indices using `rng`.
2. For each index in shuffled order: tentatively set cell to 0, call `countSolutions(givens, 2)`.
3. If still unique (`count === 1`), keep the removal; else restore the digit.
4. Stop when no further safe removals are possible or the given count reaches `targetGivens.min`.

---

## 3. Difficulty Rater — `js/generator/rater.js`

```js
rate(givens: Uint8Array(81)) →
  { tier: Tier, hardestRank: int, trace: Step[], solved: bool }
```

Invokes `solveLogically(board)` with no technique limit. Maps `hardestRank` to `tier` via `tierForRank` (imported from `solver/logical.js`; see `aspec-solver.md` §6). If the solver did not fully solve the puzzle, `solved` is `false` and `tier` is `'beyond-death-march'`; the pipeline rejects and retries.

---

## 4. Pipeline — `js/generator/pipeline.js`

```js
generateForTier(tier: Tier, { rng, seed: uint32, budget?, onProgress?, abortSignal? }) → Puzzle
```

Orchestrates the full generation loop for a given difficulty tier. See §10 for the full algorithm and tuning details.

---

## 5. Worker Entry — `js/worker/generator.worker.js`

Message-driven entry point for the generation Worker. Imports `pipeline.js` and `prng.js`. Listens for `GEN_REQUEST` and `GEN_ABORT` messages; posts `GEN_PROGRESS`, `GEN_RESULT`, and `GEN_ERROR` back to the main thread. Protocol defined in §11.

The Worker module does not export any functions — it is a self-contained message handler.

---

## 6. Worker Protocol — `js/worker/protocol.js`

Shared constants for Worker ↔ main-thread messages. Importable by both `generator.worker.js` and `clientGenProvider.js`:

```js
MSG.GEN_REQUEST   // main → worker: start generation
MSG.GEN_PROGRESS  // worker → main: progress update
MSG.GEN_RESULT    // worker → main: puzzle ready
MSG.GEN_ERROR     // worker → main: unrecoverable error
MSG.GEN_ABORT     // main → worker: cancel in-flight request
```

---

## 7. Puzzle Provider Facade — `js/providers/puzzleProvider.js`

Public facade conforming to follow-up §3.1:

```js
requestPuzzle({ difficulty: Tier, signal?: AbortSignal }) → Promise<Puzzle>
peekReady(difficulty: Tier) → Puzzle | null
primeNext(difficulty: Tier) → void
```

Internally delegates to `clientGenProvider.js`. The module exports a single instance (constructed with the single Worker).

**`Puzzle` shape** (returned by `requestPuzzle` and `peekReady`; also stored in `state.puzzle`):

```js
Puzzle = {
  id: string,               // FNV-1a hex per §10.1 toPuzzle
  difficulty: Tier,         // actual rated tier; may differ from requested on fallback (§10.1)
  givens: Uint8Array(81),   // 0 = empty
  solution: Uint8Array(81),
  solveTrace: Step[],       // always present on freshly generated puzzles
}
```

Typed arrays survive `postMessage` structured clone; the worker posts `Uint8Array` directly. The localStorage pregen cache (see `aspec-persistence.md` §2) serializes to plain `number[]` on write and restores to `Uint8Array` on read — the provider handles this conversion at the persistence boundary. All consumers always receive `Uint8Array`.

On attempt-budget fallback, `difficulty` reflects the actually-achieved tier, not the requested tier. The provider does not surface `fallback: true` to callers (§10.4 — logged only).

---

## 8. Client Gen Provider — `js/providers/clientGenProvider.js`

Manages the single Worker instance and the pre-generation cache.

- Owns the single `Worker` instance (instantiated at provider construction).
- Owns the pre-gen cache: in-memory map `difficulty → Puzzle`, mirrored to `localStorage`.
- On `requestPuzzle`: first checks `peekReady`. If a cached puzzle exists, returns immediately (resolved Promise) and consumes the cache slot. Else, posts `GEN_REQUEST` to the Worker and returns a Promise resolved when `GEN_RESULT` arrives.
- `primeNext(difficulty)`: posts a `GEN_REQUEST` with flag `background: true`. When the Worker responds with `GEN_RESULT`, writes the puzzle to in-memory cache and `localStorage`.
- One Worker, one in-flight foreground request at a time. Background requests queue behind foreground.
- Abort: when an `AbortSignal` fires, posts `GEN_ABORT` to the Worker and rejects the pending Promise with `DOMException('aborted', 'AbortError')`.

---

## 9. Key Algorithms

### 9.1 Filled-Grid Generation

`fillGrid(rng)`: recursively find next empty cell, compute candidate set, shuffle candidates with `rng`, try each in order, backtrack on failure. Returns on first success (~1–5 ms).

### 9.2 Cell Removal with Uniqueness Guard

`buildMinimalPuzzle(solution, rng, targetGivens)`: shuffle 81 indices; for each, tentatively remove and call `countSolutions(givens, 2)`. Keep removal if unique; restore if not. Stop at `targetGivens` or no safe removals remain.

### 9.3 Difficulty Rating

`rate(givens)`: run `solveLogically(board)` with no limit. Map `hardestRank` to tier via `tierForRank` (imported from `solver/logical.js`; see `aspec-solver.md` §6). If not solved, return `'beyond-death-march'` (pipeline rejects and retries).

---

## 10. Generation Pipeline Detail

### 10.1 `generateForTier(tier, opts)` Algorithm

```js
let best = null;
let attempts = 0;
const budget = opts.budget ?? ATTEMPT_BUDGET[tier];
const target = GIVEN_COUNT_TARGET[tier];

while (attempts < budget) {
  opts.abortSignal?.throwIfAborted();
  attempts++;
  // onProgress throttled to at most once every 100 ms (§10.3).
  opts.onProgress?.({ attempts, budget });

  const solution = fillGrid(opts.rng);
  const givens   = buildMinimalPuzzle(solution, opts.rng, target);
  const result   = rate(givens);

  if (!result.solved) continue;

  if (tierForRank(result.hardestRank) === tier) {
    return toPuzzle(givens, solution, tier, result.trace, opts.seed);
  }

  if (!best || result.hardestRank > best.result.hardestRank) {
    best = { givens, solution, result };
  }
}

// Budget exhausted: return hardest-so-far (silent fallback per flag 1).
console.warn('[dev] Generation budget exhausted', { tier, attempts, bestRank: best ? best.result.hardestRank : 0 });

if (!best) {
  // Degenerate: no valid puzzle was produced at all — generate one last time
  // without a tier constraint.
  const solution = fillGrid(opts.rng);
  const givens   = buildMinimalPuzzle(solution, opts.rng, target);
  const result   = rate(givens);
  const fallbackTier = tierForRank(result.hardestRank) ?? tier;
  return toPuzzle(givens, solution, fallbackTier, result.trace, opts.seed);
}

return toPuzzle(best.givens, best.solution, tierForRank(best.result.hardestRank) ?? tier, best.result.trace, opts.seed);
```

`toPuzzle` computes `id` using FNV-1a 32-bit hash of `givens || solution || seed`, encoded as hex.

### 10.2 Death March Tuning

After `buildMinimalPuzzle`, if `hardestRank` is clearly below the target tier's floor, skip running at technique limit — short-circuit to reject. Reduces wasted solver time on hopeless candidates.

### 10.3 Cancellation

`abortSignal.throwIfAborted()` checked between attempts. Each attempt runs to completion (fast enough at <50 ms typically).

### 10.4 Fallback Reporting

Worker posts `GEN_RESULT` with `fallback: true` and rank delta. Provider logs via `console.warn` only; no UI signal.

---

## 11. Worker Protocol Detail

### 11.1 Message Shapes

Main → Worker:
```js
{ type: 'GEN_REQUEST', id: string, tier: Tier, seed: uint32, background: bool, budget?: int }
{ type: 'GEN_ABORT', id: string }
```

Worker → Main:
```js
{ type: 'GEN_PROGRESS', id: string, attempts: int, budget: int }
{ type: 'GEN_RESULT', id: string, puzzle: Puzzle, fallback: bool }
{ type: 'GEN_ERROR', id: string, message: string }
```

### 11.2 Worker Lifecycle

- Single Worker instance, instantiated at app boot inside `clientGenProvider.js`.
- The Worker maintains an internal queue. Background requests go to the back of the queue. When a foreground request arrives and the active request is a background one, the Worker sets its abort flag immediately, preempting the background request. The foreground request is inserted ahead of any queued background entries (but behind any already-queued foreground requests). Concurrent foreground requests queue behind one another in arrival order. After a foreground request completes, the Worker processes the next entry in the queue.
- On `GEN_ABORT`, the Worker removes the identified request from the queue and, if it is the active request, sets the abort flag so it is checked between generation attempts.

### 11.3 Progress Throttling

`GEN_PROGRESS` posted at most every 100 ms. Used only for the cold-start progress indicator visible to the user.
