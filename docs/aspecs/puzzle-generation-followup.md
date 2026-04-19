# Puzzle Generation Spike — Follow-up Assessment

**Status:** Decision-support (not a full plan)
**Date:** 2026-04-18
**Author:** Architect
**Decision owner:** Product Director (user)

---

## 1. Context

The user has chosen **Approach 1 (client-side runtime generation)** over the bank recommendation in `docs/aspecs/puzzle-generation-spike.md`, accepting up to a **5-second** cold-start for Death March, and has asked for the generation subsystem to be **abstracted** so the approach can be swapped later without touching game logic.

This follow-up addresses: specific risks of Approach 1 under these constraints, the shape of the abstraction, whether the 5-second tolerance changes the prior analysis, and any flags that should be resolved before the full aspec is written.

## 2. Risks and Challenges Specific to Approach 1

### 2.1 The technique ladder is the entire project risk in one module

The logical solver — naked/hidden singles, locked candidates, pairs/triples, X-Wing/Swordfish/Jellyfish, XY-Wing, simple/multi-coloring, forcing chains — is the load-bearing piece. It drives **generation, difficulty rating, and hints**. Every bug in the ladder manifests as a trust-eroding gameplay bug:

- A technique that finds eliminations it shouldn't → puzzles rate as Easy but require a hidden pair → player feels lied to.
- A technique that misses eliminations it should find → puzzles rate as Death March but are actually Hard → generator runtimes explode chasing a tier it can't produce.
- An ordering bug (e.g. X-Wing tried before naked pair) → every Medium puzzle is rated Hard.

**Correctness is binary at the rating layer, and miscalibration propagates silently.** Recommend committing to a test strategy from day one: for each technique, a curated set of positions where that technique makes progress and no easier technique does. This is tractable (SudokuWiki publishes clear examples) but non-optional.

### 2.2 Death March rejection-loop variance is the real runtime risk, not single-puzzle cost

Single-puzzle rating is cheap (milliseconds). The expensive part is the outer loop: generate a minimal puzzle, rate it, and if it lands at Hard rather than Death March, throw it away and try again.

- Generator tuning matters more than solver micro-optimization. Seeding toward sparser grids, or starting from known Death-March-prone symmetry classes, matters more than squeezing 20% off Swordfish detection.
- An **attempt budget** is mandatory, with a defined fallback. If 200 attempts fail to hit Death March, what happens? Options: return the hardest-rated candidate produced so far (quietly downgrades quality), or throw and let the caller retry with a progress indicator. Decide this before coding.
- **The 5-second budget is a soft cap on the inner retry loop, not a hard wall-clock guarantee.** On a budget Android phone with a throttled CPU, Death March's tail can exceed 10 s without aggressive budgeting. The budget and fallback need to be explicit configuration, not magic numbers.

### 2.3 Background pre-generation is close to mandatory and needs a concrete design

- **Web Workers are strongly preferred over `setTimeout`-chunked cooperative loops.** They keep the main thread responsive during input. On shared static hosting, a Worker is just another static `.js` file. The module design should plan for the generator living in a Worker from the start.
- **Pre-generation must be cancellable.** If the player changes difficulty mid-generation, the in-flight Death March job must be abandoned cleanly.
- **Persistence of the pre-generated next puzzle.** If pre-generation succeeds and the player closes the tab, saving to `localStorage` effectively eliminates the cold-start case for returning players — but this is a design decision.

### 2.4 Cold-start definition needs pinning down

- Is cold start defined as "first Death March generation ever on this device" (persisted) or "first Death March generation this session" (per page load)?
- If the player selects Death March, generation starts, and the player changes their mind after 2 s and picks Easy — let the job finish and cache to `localStorage`, so the next Death March request is instant.
- The 5 s budget starts from the click, not from when the generator begins, so the experience budget is what the user actually sees.

### 2.5 Determinism and seeding

Most reference generators use `Math.random`. This is fine for players but bad for reproducing bug reports, regression testing the rater, and sharing puzzles by ID/seed. Recommend: build the generator on an **injectable, seedable PRNG** (xoshiro128** or mulberry32, ~15 lines) from day one. Free capability; extremely expensive to retrofit.

### 2.6 Device heterogeneity

Generation on a modern laptop is 5–20× faster than on a budget Android phone with a throttled CPU. Two mitigations:

- **Measure the first generation and adapt.** If Death March ran in 800 ms, aggressive pre-generation is fine; if it took 4 s, pre-generate more conservatively.
- **Budget in "solver units," not wall-clock.** The attempt budget (max candidate puzzles rejected) is device-independent; wall-clock time is not. Favor the former for the generator's internal stopping condition.

### 2.7 License hygiene for algorithmic references

Hodoku (the canonical technique-ladder reference) is GPL. Reading it to learn the algorithms is fine; line-by-line port is not, if the project uses a permissive license. SudokuWiki's prose descriptions are the safe reference for a clean-room implementation.

### 2.8 Bundle size and parse cost

A full technique ladder in vanilla JS is 2,000–3,500 lines. Minified and gzipped it is small (30–80 KB) but is the largest piece of code on the page. Worth noting for performance budgeting.

---

## 3. Generation Abstraction — Proposed Contract

### 3.1 Public contract (async throughout)

The game's main loop and UI call a single module. Three capabilities, all asynchronous to permit any backing strategy:

- `requestPuzzle({ difficulty, signal }) → Promise<Puzzle>` — get one puzzle at the given tier. Accepts an `AbortSignal` for cancellation. Supports progress callbacks for long operations.
- `peekReady(difficulty) → Puzzle | null` — synchronous, non-blocking: is there a pre-generated puzzle ready right now?
- `primeNext(difficulty)` — fire-and-forget: warm the pipeline for this tier in the background. Idempotent.

Optional future surface:

- `verify(puzzle) → { unique: boolean, difficulty: Tier }` — re-rate a puzzle. Used by tests and any future bank-loading path.

### 3.2 `Puzzle` data shape (the real abstraction boundary)

```
{
  id:          string,               // hash of givens+solution, or seed+difficulty
  difficulty:  Tier,
  givens:      number[81],           // 0 for empty
  solution:    number[81],
  solveTrace?: { cellIndex, digit, technique }[]   // optional
}
```

`solveTrace` is optional: Approach 1 emits it as a by-product of rating; a future bank would embed it; a server endpoint might omit it. The Hint feature uses `solveTrace` if present and falls back to calling the provider otherwise.

### 3.3 Provider interface (the swappable boundary)

Internally, `requestPuzzle` delegates to a `PuzzleProvider` implementation. Providers conform to the same shape. For v1:

- `ClientGenProvider` — runs the JS generator in a Web Worker.

Later, without touching game logic:

- `BankProvider` — fetches `puzzles/<tier>.json`, picks an unused entry.
- `ServerProvider` — `fetch('/generate.php?d=...')`.
- `CompositeProvider` — tries providers in order (bank first, client-gen fallback), which is exactly the "3c" variant.

Swapping approaches = write one new provider class, change one construction line.

### 3.4 Hints are a separate, parallel abstraction

`HintProvider` interface:

- `nextHint(puzzle, playerState) → { cellIndex, digit, technique } | null`

Two implementations:

- `TraceHintProvider` — reads the next step from `puzzle.solveTrace` that hasn't been revealed yet. Sufficient for v1 with client-gen emitting traces.
- `SolverHintProvider` — runs the logical solver against the current board state. Needed if we ever need "what's the best next move given what the player has filled in so far?" — i.e., reasoning about player state, not just the pristine solve sequence.

### 3.5 What this does and does not buy

**Buys:** Swap to a bank, server endpoint, or composite provider later with no changes to game logic, UI state, persistence, or hint behavior. One-file change.

**Does not buy:** Reduced v1 implementation cost. The logical solver still has to exist in v1. This abstraction protects future change; it does not shrink the initial build.

---

## 4. Does the 5-Second Tolerance Change the Analysis?

**Modestly. It de-risks Approach 1 but does not eliminate the core concerns.**

What it changes:

- The spike's "median 1–3 s, tail 5–10 s+" means the 5 s budget catches the median comfortably and most tail cases. The remaining tail becomes a budget-exhaustion fallback case, not a common experience.
- Background pre-generation goes from "absolutely mandatory to be playable" to "strongly recommended for feel."
- It relaxes pressure to aggressively optimize chain/coloring techniques for v1. Correct and reasonably fast is sufficient; hand-tuned is not required.

What it does **not** change:

- The technique-ladder correctness risk (§2.1). Miscalibration is a trust problem regardless of time budget.
- The need for an attempt budget and defined fallback (§2.2).
- The Web Worker requirement (§2.3). A 5 s generation on the main thread **freezes the page** — no input, no scrolling. A frozen page within 5 s feels broken regardless of the intended wait. Workerization is about UI responsiveness, not total wait time.
- The determinism/seeding recommendation (§2.5).

Net: the 5 s tolerance moves Approach 1 from "requires pre-generation trick just to be tolerable" to "tolerable as-is, pleasant with pre-generation." That is a meaningful softening and makes the choice reasonable.

---

## 5. Flags — Resolved

All flags resolved by user on 2026-04-18.

| # | Flag | Resolution |
|---|------|------------|
| 1 | Death March attempt-budget fallback | Return hardest candidate found; silent in UI |
| 2 | Persist pre-generated next puzzle across sessions | Yes, to localStorage keyed by difficulty |
| 3 | Cold-start scope | Per-device |
| 4 | Project license | MIT — clean-room implementation from SudokuWiki prose; no line-level Hodoku reference |
| 5 | Web Worker use | Confirmed |
| 6 | Seedable PRNG | Confirmed |
| 7 | Difficulty downgrade visibility | Silent in UI; dev-only telemetry acceptable |
| 8 | Hint scope in v1 | Option B — SolverHintProvider built in v1 to support future coach/teaching mode |

## 5a. Original Flag Text (for reference)

1. **Fallback policy when attempt budget is exhausted for Death March.** Recommend: return the hardest candidate produced so far and log a dev-only warning. Alternative: retry with progress indicator.
2. **Persist the background pre-generated "next puzzle" across sessions.** Recommend: yes, to `localStorage` keyed by difficulty.
3. **Cold-start scope.** Recommend: per-device — first ever Death March generation on this browser takes up to 5 s; subsequent visits instant via persisted pre-gen.
4. **Project license.** Affects whether Hodoku can be referenced at line-level or only conceptually. Pin before coding begins.
5. **Web Worker use.** A static `.js` file; satisfies "no build step" and "vanilla JS." Adds a second JS entry point. Recommend: yes, from day one.
6. **Seedable PRNG commitment.** Recommend: yes, from day one, so puzzle IDs and reproducible bugs are free.
7. **Difficulty downgrade visibility.** If fallback (flag 1) lands a Hard puzzle in the Death March slot, does the UI tell the player? Recommend: no — silent in v1 with dev-only telemetry.
8. **⚠️ Scope of hints in v1.** This is the one flag that could change the abstraction shape.

   - If v1 hints are "reveal the next cell from the solve trace" — `TraceHintProvider` is sufficient. The logical solver is only used internally by the generator; it does not need to be exposed through the hint interface.
   - If v1 hints must reason about **the player's current board state** (e.g., "what's the easiest move available to me right now, given what I've already filled in?"), then `SolverHintProvider` is needed in v1, and the full technique ladder must be accessible via the hint interface, not just buried in the generator.

   The rspec says hints fill a selected cell with the correct digit. This implies "next step from trace" is sufficient for v1. But if the user's long-term vision for hints includes technique explanation or context-aware suggestion, `SolverHintProvider` is on the v1.x roadmap — which means the abstraction in §3.4 should be locked in before coding begins, not added later.

---

## 6. Bottom Line

Approach 1 under a 5-second tolerance is a defensible and well-suited choice for this project. The real risks are (a) correctness of the technique ladder, (b) variance in the Death March retry loop, and (c) main-thread responsiveness during generation — not raw wall-clock speed. All three are addressable with well-known techniques (curated technique tests, attempt budgets with defined fallback, Web Worker) as long as they are designed in from day one.

The abstraction in §3 is lightweight and genuinely protects future substitutability at minimal up-front cost.

Before the full aspec is written, the eight flags in §5 should be resolved — **flag 8 (hint scope) most importantly**, since it is the only one that could change the shape of the abstraction itself.
