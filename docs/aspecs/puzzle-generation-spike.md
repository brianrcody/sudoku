# Puzzle Generation Spike — Evaluation and Recommendation

**Status:** Evaluation for decision
**Date:** 2026-04-18
**Author:** Architect
**Decision owner:** Product Director (user)

---

## 1. Purpose and Scope

This is a narrow-scope spike. It evaluates three approaches to Sudoku puzzle generation and makes a recommendation. It does not yet specify the full implementation plan. The goal is to give the Product Director enough concrete information to pick one approach so the full aspec can be written against it.

The hard requirements driving this evaluation (from `docs/rspecs/rspec-001-v1.md` and `docs/agents/architect.md`):

1. Puzzles must have **exactly one solution**.
2. Difficulty must be rated by **logical solving technique complexity**, not clue count. Random clue removal is explicitly rejected.
3. The environment is shared web hosting; vanilla JS/CSS client; PHP 8.2 available server-side; no build step; local dev must mirror deployed behavior.
4. Target: all user-facing actions complete in under 1 second. Generation is explicitly the one place this may be negotiable; longer times must be flagged.
5. Server-side code requires explicit user approval.

Five difficulty tiers to target (from rspec §2.3): Kiddie (naked singles), Easy (+ hidden singles), Medium (+ naked/hidden pairs/triples), Hard (+ X-Wing, Swordfish), Death March (+ forcing chains, coloring, advanced patterns).

---

## 2. Shared Technical Background

All three approaches share the same underlying building blocks. Understanding these clarifies where the approaches actually differ.

### 2.1 Solving the grid (needed by all approaches)

- **Norvig's approach** (constraint propagation + backtracking): maintain a set of candidate digits per cell; whenever a cell is reduced to one candidate or a unit has one remaining place for a digit, propagate that assignment's consequences; when propagation stalls, pick the cell with the fewest candidates and recurse. On commodity hardware a pure Norvig solver solves essentially any valid Sudoku in well under 10 ms in JavaScript. Critically, this solver is only used to check **uniqueness** and to obtain the full solution — it does not rate difficulty.
- **Knuth's Dancing Links (DLX)** solves Sudoku as an exact cover problem (729 possible row/col/digit placements, 324 constraints). DLX is faster and more uniform than Norvig for hard instances. In JavaScript, a DLX solver handles arbitrary Sudoku in 1–10 ms. Either Norvig or DLX is sufficient for the "is the solution unique?" role.

### 2.2 Rating the grid (the hard problem)

Difficulty-by-technique requires a **logical/human solver** that tries techniques in an ordered list, simplest first, and records the hardest technique actually needed. This is fundamentally different from Norvig/DLX, which just find *a* solution; the logical solver must find the solution the way a human would.

Techniques must be implemented in ranked order. Using SudokuWiki / Hodoku taxonomy:

| Tier           | Techniques the solver must implement                                    |
|----------------|-------------------------------------------------------------------------|
| Kiddie         | Naked single                                                            |
| Easy           | + Hidden single                                                         |
| Medium         | + Locked candidates (pointing/claiming), naked/hidden pair, naked/hidden triple |
| Hard           | + X-Wing, Swordfish, Jellyfish (basic fish), possibly XY-Wing           |
| Death March    | + Coloring (simple/multi), Forcing chains, XY-chains, possibly Uniqueness |

The rating algorithm: repeatedly find the easiest technique that makes progress; apply it; loop. If the solver finishes the grid, the hardest technique it used defines the difficulty. If the solver gets stuck even with all techniques enabled, the puzzle requires guessing and is either rejected or classified above Death March.

**This logical solver is the dominant implementation cost regardless of approach**, because the same techniques are needed for the in-game Hint feature (hints should prefer to reveal a cell solvable by a low-tier technique). Building it once serves generation, rating, and hints.

### 2.3 Generating a candidate puzzle

Standard pipeline used by essentially every high-quality generator (including Hodoku):

1. Produce a filled solution grid (random-valued backtracking, or seed + transformations of a known solved grid).
2. Choose cells to reveal/remove in a random order.
3. After each tentative removal, check uniqueness via Norvig/DLX. If removing a cell destroys uniqueness, restore it and continue.
4. Stop when no more cells can be removed without breaking uniqueness (a minimal puzzle) or when a target givens count is reached.
5. Rate the resulting puzzle with the logical solver.
6. If the rating matches the target tier, accept; otherwise retry or adjust.

The "retry until target tier reached" loop is the main runtime variable. Easy tiers succeed quickly; Death March may take many attempts.

### 2.4 Rough performance reference points

Based on well-documented generator implementations (Hodoku, sudoku-gen, various open-source JS generators), and Norvig/DLX timing characteristics, realistic per-puzzle generation times in browser JavaScript, single-threaded:

| Tier           | Solver work per accepted puzzle              | Realistic JS time per puzzle |
|----------------|----------------------------------------------|------------------------------|
| Kiddie/Easy    | Very fast; most random removals hit target   | 10–100 ms                    |
| Medium         | Multiple rating passes; moderate retries     | 100–400 ms                   |
| Hard           | Fish detection is cheap but rejection rate rises | 300 ms – 2 s              |
| Death March    | Chains/coloring expensive; high rejection    | 1 s – 10+ s, highly variable |

These are ballpark figures. A carefully written generator can do better; a naive one will do much worse. The key point: **Kiddie through Medium easily fit under 1 s on any device. Hard is borderline. Death March is the risk.**

---

## 3. Approach 1: Client-Side Generation

### 3.1 How it works

Everything — solution construction, removal loop, uniqueness check, technique-based rating — runs in the browser in vanilla JavaScript when the player taps "New Puzzle." No network round trip. All code ships as static JS.

### 3.2 Complexity to implement correctly

High, but the complexity is inherent to the problem, not the approach. Components:

- Norvig-style or DLX solver for uniqueness (~300 lines JS for Norvig; ~500 for a clean DLX).
- Filled-grid generator (~100 lines).
- Removal loop with uniqueness guard (~100 lines).
- **Logical solver with technique ladder — the bulk of the work.** Naked/hidden singles are trivial. Pairs/triples and locked candidates are moderate. X-Wing/Swordfish are well-defined set-cover patterns, a few hundred lines each. Forcing chains and coloring are graph-search algorithms, several hundred lines and the hardest to get right.
- Rating harness that drives the logical solver and reports the hardest technique used.

Rough size estimate for the full technique ladder in vanilla JS: 2000–3500 lines, depending on code style. This is a real project but well-bounded and entirely testable.

### 3.3 Difficulty calibration

**Yes, fully supported.** The logical solver runs locally on every generated candidate. This is exactly the Hodoku model, implemented in JS instead of Java. Rating is deterministic from the puzzle grid and the enabled technique set. The same solver also powers the Hint button, so no duplicate work.

### 3.4 Uniqueness guarantee

**Yes, strong.** Every candidate is uniqueness-checked by the Norvig/DLX solver (find two solutions → reject). This is standard, reliable, and fast.

### 3.5 Performance vs. 1-second target

- Kiddie / Easy / Medium: comfortably under 1 s. Expect 50–400 ms.
- Hard: typically under 1 s once the generator is tuned; worst-case attempts may occasionally push past. Manageable.
- **Death March: this is the flag.** Realistic estimate: median 1–3 s, tail cases 5–10 s+. The variance comes from the rejection loop — most random minimal puzzles are Medium or Hard, and the generator must keep retrying until one lands in the Death March band.

Mitigations that make this acceptable without a network call:

- Generate the *next* puzzle in the background (a Web Worker, or just a `setTimeout`-chunked loop) while the current puzzle is being played. On "New Puzzle," hand over the pre-generated one instantly. This trivially meets the under-1-second interactive target for every subsequent generation and hides the cost.
- On the very first Death March generation (cold start), show a brief progress indicator. Expected wait: typically 1–3 s.
- Cap Death March work with an attempt budget (e.g., 200 candidate puzzles) and fall back to relaxing the lower-bound technique requirement if the budget is exhausted.

With background pre-generation, the interactive cost for the player is effectively zero for every New Puzzle except the very first one at cold start.

### 3.6 Tradeoffs

Pros:
- Zero server-side complexity; pure static deployment.
- Local dev trivially mirrors deployed behavior (open `index.html`).
- No hosting cost per request; generator scales trivially.
- Same logical solver also drives hints and any future features (explain-this-move, etc.).
- Fully offline-capable.

Cons:
- Biggest single piece of code in the project is the technique ladder. Implementation effort is front-loaded.
- Death March cold-start generation may exceed 1 s on low-end devices; requires the background pre-generation mitigation to stay smooth.
- Technique implementations must be correct — bugs show up as miscalibrated difficulty, which erodes player trust.

---

## 4. Approach 2: Server-Side Generation

### 4.1 How it works

PHP script on the shared host receives a request like `GET /generate.php?difficulty=hard`, runs the same pipeline (filled grid → remove → uniqueness → rate), and returns JSON `{ givens: [...], solution: [...], difficulty: "hard" }`. Client fetches, renders.

### 4.2 Complexity to implement correctly

Essentially the same algorithmic complexity as client-side — the same technique ladder must exist — but now in PHP. PHP is a reasonable language for this (associative arrays, bitmasks, recursion); it is not a natural fit for graph-based chain/coloring techniques and will be somewhat more verbose than equivalent JS.

Additional complexity introduced by this approach:

- Port and maintain the logical solver in PHP.
- Request/response plumbing: endpoint, input validation, error handling, JSON serialization, client fetch logic, loading/error UI.
- **Hint feature still needs a logical solver on the client** — or every hint becomes another server round trip (slow, and breaks offline). So realistically the logical solver exists twice: in PHP for generation and in JS for hints. This is the decisive downside.
- Local dev must match: requires `php -S localhost:8080` for local runs, rather than plain file open. Acceptable per architect.md, but a real step up in friction.
- Shared hosting execution-time limits (typically 30–60 s, often configurable; sometimes not) put a hard ceiling on Death March attempts — on most shared hosts this is fine but worth confirming.

### 4.3 Difficulty calibration

**Yes, equivalent quality to client-side.** Same algorithm, different language. No inherent advantage over client-side.

### 4.4 Uniqueness guarantee

**Yes**, same technique: solver finds at most one solution.

### 4.5 Performance vs. 1-second target

Server generation time itself is similar to or slightly better than JS (PHP 8.2 with JIT is competitive with V8 for this sort of work). Added cost: network round trip.

- Round trip on shared hosting from a typical user location: 100–400 ms added per request, before generation starts.
- Kiddie/Easy/Medium: well within 1 s including round trip.
- Hard: usually within 1 s including round trip.
- Death March: server side the generation cost is similar to client side (1 s – 10 s tail); adding network makes the tail worse, not better.

The network round trip buys nothing in exchange for itself. It does not improve difficulty calibration, does not speed up generation, and does not reduce implementation size.

### 4.6 Tradeoffs

Pros:
- Smaller initial JS payload (no technique ladder shipped to client) — though the hint feature still requires one client-side.
- Generation happens off the user's device (helps very low-end devices).
- Easier to introduce a puzzle cache later without changing the client.

Cons:
- **Requires user approval per `docs/agents/architect.md`** (server-side code must be flagged to the Orchestrator for user approval).
- Duplicates the logical solver (PHP for generation + JS for hints), or forces every hint through a network call.
- Local dev environment is more complex (`php -S`).
- Network errors become a new failure mode to design around.
- No calibration advantage over client-side.
- Shared host CPU-limit risk on Death March tail cases.

### 4.7 User-approval flag

This approach introduces server-side PHP and therefore requires explicit user approval before it can be part of the implementation plan.

---

## 5. Approach 3: Hybrid (Pre-Generated Puzzle Bank)

### 5.1 How it works

Generation is done **ahead of time** — not at play time. A one-off build script (run by the developer, not on the host) generates N puzzles at each difficulty tier using the full technique-based pipeline, rates each one, and emits static JSON files like `puzzles/hard.json`, `puzzles/death-march.json`. At runtime the client fetches one of these files once, caches it, and picks a random unused puzzle on demand.

Variants:

- **3a. Fully pre-generated bank, static JSON.** No runtime generation at all. The bank is big enough to give players an effectively unlimited feel (e.g., 500–2000 per tier). Tracking which puzzles have been seen uses a cookie or localStorage of puzzle IDs.
- **3b. Server cache + on-demand.** Server-side generator fills a cache file; background job regenerates. Same user-approval issue as Approach 2, plus a cron or equivalent.
- **3c. Bank + client fallback.** Ship a bank *and* a client-side generator. Use the bank by default for instant puzzles; fall back to JS generation if the bank is exhausted or to deliver true unlimited supply.

### 5.2 Complexity to implement correctly

The generator still must exist — but it runs offline, in a context where runtime doesn't matter. This opens up options:

- Build script can be written in any language (JS via Node, Python, Ruby). Because runtime doesn't matter, a simpler, less-optimized implementation is viable.
- **Simplest path: reuse an existing open-source generator** (e.g., Hodoku in batch mode) to produce the banks once. This sidesteps the "build the technique ladder" cost entirely for v1. The banks become project assets; the ladder can be added to the client later for hints.
- If Hodoku (GPL) is used, its output puzzles are not encumbered by its license; only redistribution of Hodoku source/binary is. Pending license confirmation, but batch output is normally unencumbered.

Runtime complexity on the client is tiny: fetch a JSON file, pick a puzzle.

**The catch: the Hint feature still wants a logical solver.** Or hints can be implemented cheaply by storing, alongside each puzzle in the bank, a "solve trace" — the ordered list of (cell, digit, technique) steps — so that Hint just returns the next step in the trace. This is elegant and avoids shipping a solver. Bank files grow modestly (each trace is ~81 short records).

### 5.3 Difficulty calibration

**Yes, highest quality possible.** Because generation is offline, you can afford to be strict: generate 10× the number you need and hand-cull, or run a second-pass rater, or use multiple generators and vote. Every shipped puzzle can be verified against a canonical rater (e.g., Hodoku) before it ever reaches a user.

### 5.4 Uniqueness guarantee

**Yes**, verified at bank-build time. Banks can also be validated at commit time by a checked-in test that re-solves each puzzle.

### 5.5 Performance vs. 1-second target

- **Fetching a puzzle: ~instant.** The bank JSON is static; one fetch per session (cacheable, gzippable). Picking a puzzle is an array lookup.
- No runtime generation cost at all (for 3a).
- Bank sizes: a puzzle + solution + solve trace is ~400–600 bytes; 2000 puzzles per tier × 5 tiers ≈ 2–5 MB uncompressed, ~300–700 KB gzipped. Comfortable.
- **Easily meets the 1-second target with significant margin for all tiers, including Death March.**

### 5.6 Tradeoffs

Pros:
- **Fastest runtime; meets 1-second target with margin, including Death March.**
- Puzzle quality can be curated to a higher standard than any on-the-fly generator.
- No server-side runtime code required (3a); no user approval needed for server code.
- Reduces client JS substantially (no generator/solver in the shipped bundle, if using trace-based hints).
- Simple and predictable; minimal runtime failure modes.

Cons:
- Finite supply. "Unlimited puzzles" is not literally true, though a 2000-puzzle bank per tier gives multi-year supply for a typical player. Can be refilled by rerunning the build script and committing the new JSON.
- Need tracking of seen puzzles to avoid repeats (cookie/localStorage; small).
- Needs a build-time toolchain the project otherwise wouldn't have (runs on the developer's machine only; no deployed build step).
- If Hodoku is used for initial banks, a license check is warranted.
- If hint functionality later needs to go beyond "next step in trace" (e.g., explain *why*), we would eventually need a client-side logical solver.

---

## 6. Side-by-Side Summary

| Dimension                                | 1. Client-side               | 2. Server-side            | 3. Pre-generated bank       |
|------------------------------------------|------------------------------|---------------------------|-----------------------------|
| Meets <1 s for Kiddie–Medium             | Yes                          | Yes                       | Yes (with large margin)     |
| Meets <1 s for Hard                      | Usually yes (with pre-gen)   | Usually yes               | Yes                         |
| Meets <1 s for Death March               | Not cold; yes with pre-gen   | Not reliably on tail cases | Yes                        |
| Technique-based difficulty               | Yes                          | Yes                       | Yes (highest quality)       |
| Unique-solution guarantee                | Yes                          | Yes                       | Yes (verified at build)     |
| Server-side code required                | No                           | **Yes (needs user OK)**   | No (3a)                     |
| Local dev = deployed                     | Yes (static files)           | Needs `php -S`            | Yes (static files)          |
| Logical solver needed at runtime         | Yes (also powers hints)      | Yes in PHP + JS for hints | Optional (traces for hints) |
| Unlimited supply                         | Truly unlimited              | Truly unlimited           | Bounded but very large      |
| Offline capable                          | Yes                          | No                        | Yes (after bank loads)      |
| Implementation cost                      | High (technique ladder in JS)| High (ladder in PHP + plumbing) | Low runtime; build cost borne once |
| Network failure risk                     | No                           | Yes                       | Minor (initial JSON fetch)  |

---

## 7. Recommendation

**Primary recommendation: Approach 3a — pre-generated static puzzle bank(s) served as JSON — as the v1 generation strategy, with trace-based hints baked into each puzzle.**

**Secondary recommendation: keep the logical solver on the roadmap as a client-side module**, not to block v1. If and when richer hinting, explanations, or truly unlimited generation are needed, add Approach 1 as a supplement (the "3c" variant, deferred).

### 7.1 Why bank-first

- **It is the only approach that meets the under-1-second target reliably across all five tiers, including Death March, with no caveats.**
- **Best possible difficulty calibration.** Banks can be built with any tool — including Hodoku — and curated. The player gets puzzles that have been verified, not merely produced.
- **No server-side code.** Keeps deployment to static files on shared hosting, matching the explicit preference in `docs/agents/architect.md`.
- **Local dev equals deployed dev.** Opening `index.html` locally behaves identically to production.
- **Smallest runtime failure surface.**
- **Dramatically less runtime JS than Approach 1** — no technique ladder ships to the browser in v1.
- **Iteratively expandable.** Need more puzzles? Rerun the build script and commit more JSON.

### 7.2 Why not server-side (Approach 2)

It introduces server-side code (requiring approval), a network failure mode, a local-dev mismatch, and a duplicated solver — all in exchange for no quality improvement and no performance improvement. There is no scenario in which Approach 2 is the best choice for this project as scoped.

### 7.3 Why defer (but not discard) client-side (Approach 1)

Client-side generation is technically sound and long-term attractive (true unlimited supply, powers richer hints, offline). But its main cost — building the technique ladder in JS — is genuinely large and not required to ship a great v1 if banks are curated well. Deferring it lets v1 ship sooner and de-risks the schedule. For v1 it is premature.

### 7.4 Concrete shape of the recommendation

Not the full plan — just enough to make the recommendation concrete:

- A one-off build script (Node.js or Python, developer-run, not deployed) that uses a reference generator (Hodoku batch mode is the leading candidate; pending license check) to produce, for each tier, N puzzles with:
  - the 81-cell givens,
  - the 81-cell solution,
  - an ordered solve trace `[{ cell, digit, technique }, ...]` emitted by the rater.
- Proposed v1 bank sizes: Kiddie 300, Easy 1000, Medium 1000, Hard 1000, Death March 500. Total ~2–5 MB uncompressed, ~300–700 KB gzipped.
- Banks committed to the repo under `puzzles/`, fetched on first use per tier, cached in memory for the session.
- A "seen puzzle IDs" set stored alongside existing cookie state so the same player doesn't repeat until the bank is exhausted; on exhaustion, reset the seen set.
- Hint feature reads the next unrevealed step from the trace for the current puzzle. No client-side solver needed in v1.
- Uniqueness and difficulty validated once at build time, optionally re-checked by a commit-time test.

### 7.5 Flags for the user

1. **License check on Hodoku batch output** for bank construction. Almost certainly fine (puzzle numbers are not copyrightable), but worth confirming.
2. **Bank-size policy.** The proposed sizes are a starting point. If the Product Director wants literal unlimited supply in v1, Approach 1 (or 3c) is needed instead; confirm whether "very large finite bank" is acceptable as the v1 UX for "unlimited."
3. **If the Product Director prefers Approach 1 anyway** — e.g., for philosophical reasons or to set up long-term hinting features — the plan is viable with this explicit caveat: **Death March cold-start generation may exceed 1 second** (median 1–3 s, tail cases 5–10 s), mitigated to effectively 0 s via background pre-generation during play.
