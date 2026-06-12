# V3 Exploration — Harder Difficulty Tiers

**Date:** 2026-06-11
**Status:** Exploration / pre-requirements. Not a commitment.
**Author:** Orchestrator (in-session)
**Purpose:** Assess what additional solving strategies a tier above Death March could draw on, and
how hard each would be across three axes: (1) solver implementation, (2) coaching cues, and
(3) puzzle-generation practicality.

> Builds on `v3featureCandidates.md` §"Extended Difficulty Tiers." That doc sketched the
> technique list and a coaching-feasibility triage. This doc grounds the assessment in the actual
> solver/generator code and surfaces the architectural constraint that the earlier draft missed.

---

## 1. TL;DR — the central finding

There is a real, frequently-occupied band of logical difficulty above today's ceiling — but it sits
in an awkward place relative to the coaching model:

- **The techniques that coach cleanly (XYZ-Wing, WXYZ-Wing, finned fish) are catalog-*easier* than
  our current rank-15 ceiling.** Placed above it, they'd almost never fire; placed at their true
  rank, they'd reshuffle the *existing* Hard / Death March boundaries. They don't anchor a new top
  tier without disturbing the ones we have.

- **The techniques that are genuinely harder than our ceiling (ALS-AIC, grouped AIC, Death Blossom,
  Forcing Nets) are exactly the ones that strain or break the linear-arrow coaching vocabulary.**

- **One family escapes the bind: uniqueness-based techniques (Unique Rectangles, BUG).** They are
  genuinely orthogonal to the chain ladder, frequently *strictly* necessary, and have a clean
  4-cell visual. They are the natural keystone for an honest, coachable tier above Death March.

A second, lower-risk finding: **our rank-15 "Forcing Chain (AIC)" is much weaker than its name
suggests** — it's a bounded nice-loop search, not a general AIC (see §2.2). Strengthening it is an
alternative or complement to adding a new tier.

---

## 2. Why the rating architecture dictates everything

### 2.1 Rating = lowest-first, hardest-rank-wins

`solveLogically` (`js/solver/logical.js`) walks `TECHNIQUES[]` in rank order, applies the **first**
technique that makes progress, and restarts from rank 0. `hardestRank` is the max rank ever used;
`tierForRank` maps it to a tier. The generator (`pipeline.js`) is pure **rejection sampling**:
fill → strip to a minimal puzzle → rate → accept iff the rated tier matches the request, else retry
up to `ATTEMPT_BUDGET` (death-march = 300), then silently return the hardest puzzle found.

Two consequences that govern any new-tier design:

1. **A new technique only changes a puzzle's rating if it is *strictly necessary* at some step** —
   i.e., at some point in the solve, *no* lower-ranked technique can make any progress but the new
   one can. A technique that is always subsumed by something cheaper is dead code for rating.

2. **Where you insert a technique in the ladder is the whole design.**
   - *Above rank 15:* existing tiers are completely undisturbed (for any board solvable with ranks
     1–15, the new technique never fires). The new tier captures exactly the puzzles that need
     rank 16+. Clean — but the technique only earns its place if it's genuinely above the current
     ceiling.
   - *Below rank 15:* the technique is preferred over harder ones when applicable, which **re-rates
     existing puzzles** — a puzzle that's Death March today because it needed AIC might drop to a
     lower tier if an inserted technique cracks it sooner. That changes what current difficulties
     *mean* and forces re-rating the curated regression set + re-tuning `GIVEN_COUNT_TARGET`.

### 2.2 Our rank-15 ceiling is a *nice-loop* AIC, not a full AIC

`forcingChains.js` `aicSearch` is a depth-bounded (≤ 8) DFS over **single-candidate nodes** that
only emits an elimination when the chain **closes back to its start** (type-1 and type-2 nice
loops). It does **not** find:

- Open AICs (the common case: a strong-link chain between two endpoints that see a common cell —
  eliminate there), unless they happen to form a loop;
- Grouped nodes (a node that is a set of candidates in a box/line);
- ALS nodes.

So a meaningful fraction of minimal puzzles are currently rated `beyond-death-march` and **rejected
by the generator today** purely because this search is narrow. That's the good news for a new tier:
the logical space immediately above the ceiling is real and populated, not exotic. It's also a
standalone opportunity — see §6, Option C.

---

## 3. Technique-by-technique assessment

Grouped into three bands by how they sit against §2. For each: solver cost, coaching fit against the
**sealed `CoachStep` schema** (`aspec-coach-analyzer.md` §3 — roles `target / cause / elimTarget /
unitMember / scA / scB`, arrow styles `straight / dashed / bezier-arc / connector-chain / elim-line /
chain-edge`, plus `complexity.acknowledged`), and generation behavior.

### Band 1 — Clean to coach, but *below* the current ceiling

These map onto the existing architecture beautifully but are catalog-easier than our nice-loop AIC.
They make the rater *more accurate* and enrich Hard / Death March; they do **not** create a tier
above Death March without the re-rating cost of §2.1(2).

| Technique | Solver | Coaching | Generation |
|---|---|---|---|
| **XYZ-Wing** | Small. A bivalue-pivot variant of XY-Wing with a 3-candidate pivot; the existing `xyWing.js` is a near-template. | **Clean.** `cause = [pivot, wing1, wing2]`, `elimTarget` = cells seeing all three, `chain-edge` + `dashed`. No schema change. | Frequently necessary at its true rank (~11–12). Inserted there, re-rates some Hard puzzles. |
| **WXYZ-Wing** | Moderate. 4-cell generalization; more enumeration but same shape. | **Clean.** Same role pattern, one extra wing in `cause`. | Rarer than XYZ; same re-rating caveat. |
| **Finned / Sashimi X-Wing & Swordfish** | **Low.** `xWing.js` already exposes a generic `fish(state, size, base, cover)` (Swordfish/Jellyfish call it). Finned fish = relax the cover constraint and track fin cells. | **One additive role** (`fin`) — a sealed-schema change (process gate, low risk). Otherwise reuses `connector-chain` + `dashed`. | Common; sits between basic fish and chains in catalog terms — i.e., below our ceiling. |

### Band 2 — Anchors a new tier, coachable only with caveats

Genuinely above the nice-loop ceiling (or orthogonal to it), so they *populate a new tier* without
disturbing existing ones. Coaching ranges from clean (UR Type 1) to complexity-acknowledged
(ALS-XZ, Medusa).

| Technique | Solver | Coaching | Generation |
|---|---|---|---|
| **Unique Rectangles (Type 1, then 2/4)** | Moderate, self-contained. Scan for the "deadly pattern" (4 cells, 2 rows × 2 cols × 2 boxes, two shared candidates). No chain machinery. | **Type 1 is clean** — `cause` = 4 UR cells, `connector-chain` rectangle, `digits` = the pair, `elimTarget` = the roof cell. The *justification* ("else two solutions") is a different *kind* of argument than elimination chains; compressible to one line with care. Types 2–6 each need bespoke text/roles. | **Strong fit.** Orthogonal to the chain ladder → frequently strictly necessary even above a strong AIC → the tier actually populates. Caveat: relies on the unique-solution constraint (the generator guarantees it), which some purists consider a different category of reasoning. |
| **ALS-XZ** | **Higher.** Requires enumerating Almost-Locked-Sets (combinatorial) and pairing them on a restricted common digit. New, fairly heavy machinery. | **Complexity-acknowledged.** Good news: `scA` / `scB` (the coloring roles) can be repurposed to highlight the two ALS cell groups, `elimTarget` for Z. The wall is that the schema highlights whole *cells*, not *which candidates define each set* — so the honest output is "two linked sets force Z out here; trace which digits define each set yourself," analogous to the accepted Multi-Coloring simplification (fspec §8.13). | Frequently necessary above the nice-loop ceiling → populates well. But expensive to search (see §4). |
| **3D Medusa** | Moderate-high — multi-digit coloring across bilocation/bivalue links. | **Strained.** `scA` / `scB` exist, but Medusa colors *candidates*, and one cell can carry two differently-colored candidates of different digits. The schema has no candidate-level color. Output is a lossy cell-level approximation. | Populates, but coaching value is low; questionable ROI. |

### Band 3 — Above the ceiling, breaks the coaching model

Confirms `v3featureCandidates.md`. These either branch (not linear) or use grouped/ALS nodes the
arrow vocabulary assumes away. The graceful ceiling here is *exactly what rank 15 already does*:
name it, highlight endpoints, acknowledge the chain isn't walkable.

- **ALS-AIC / Grouped AIC** — chain nodes are candidate *groups*; the one-candidate-per-node arrow
  model can't represent them.
- **Death Blossom** — stem cell + multiple ALS "petals"; no clean linear representation.
- **Forcing Nets** — branching inference tree; arrows are built for linear chains only.
- **Exocet / Pattern Overlay** — powerful, rare, brute-force-adjacent; both the solver cost and the
  coaching story are poor.

---

## 4. Generation practicality (the real gate)

Coaching feasibility is the *interesting* question; generation practicality is the *binding* one.

**Yield collapses, and we can't yet quantify it.** Harder puzzles are rarer among random minimal
puzzles, so the accept-rate per attempt for a tier above Death March will be far below current
tiers. We do not know the rate — it must be measured (§7). Death March already uses a 300-attempt
budget; a new tier plausibly needs an order of magnitude more, or a different generation strategy
entirely (e.g., construction / seeded-hard rather than pure rejection sampling).

**Every attempt pays full freight.** To even *learn* that a puzzle needs rank 16+, the solver must
fail all of ranks 1–15 at some step first — including the bounded rank-14/15 DFS — and *then* run
the new, more expensive searches (ALS enumeration is combinatorially heavy). So per-attempt cost
rises at the same time yield falls. This stacks against the <1 s action / <5 s Death-March cold-start
precedents. Background pre-generation + the localStorage cache hide some of it, but a tier where
1-in-thousands qualifies will routinely exhaust the budget.

**The silent fallback becomes a UX bug at this tier.** `generateForTier` currently returns the
hardest puzzle found when the budget is exhausted, silently mislabeled. For a top tier that's hard
to hit, the user would frequently ask for "Nightmare" and get a Death March wearing its name. Any
new-tier work must revisit the fallback (e.g., keep a warm pre-gen pool, or surface an honest
"couldn't find one, here's the hardest we have").

---

## 5. The central tension, stated plainly

> The techniques that fit the coaching model cleanly are not actually harder than our current
> ceiling; the techniques that are genuinely harder than our ceiling are the ones that strain or
> break the coaching model.

The only family that threads the needle is **uniqueness-based (Unique Rectangles / BUG)**:
genuinely orthogonal, frequently strictly-necessary, and cleanly coachable for the common types.

---

## 6. Options

**Option A — Honest, coachable expert tier (recommended).**
New tier (e.g., "Nightmare"). Keystone: **Unique Rectangles** (Type 1 first, then 2/4 — fully
coached). Add **ALS-XZ** as a complexity-acknowledged technique (scA/scB set highlight + endpoints).
Optionally fold in **Option C** so the AIC rung beneath is also honest. Net: a new tier that
*populates* (UR + ALS are orthogonal/above the ceiling) and is *coachable* at least at the rank-14/15
honesty level. Cost: UR's uniqueness-constraint philosophy; ALS solver + generation budget work.

**Option B — Catalog completeness, same tiers.**
Insert XYZ-Wing, WXYZ-Wing, finned fish at their *true* ranks (below AIC). Fully coachable, makes the
rater more accurate, enriches Hard / Death March. Creates **no** new tier and **re-rates existing
puzzles** — needs regression-set re-rating + `GIVEN_COUNT_TARGET` re-tuning. Lower coaching risk,
higher "changes what current difficulties mean" risk.

**Option C — Strengthen rank 15 instead of adding a tier.**
Upgrade `aicSearch` from nice-loops-only to full open AIC (and optionally grouped nodes). Reduces the
`beyond-death-march` rejection rate, makes Death March genuinely cover the AIC class it claims, and
improves generation yield at the top of the current ladder. No new tier, no new coaching surface
(it's still "Forcing Chain"). Cheapest path to "harder puzzles" if a *new named tier* isn't the
actual goal. Combinable with A.

Recommendation: **A, likely with C.** A delivers a real, honest, coachable tier; C makes the rung
beneath it trustworthy. B is worth doing eventually for rater accuracy but is a separate effort and
shouldn't be bundled with a "harder levels" milestone because of its re-rating blast radius.

---

## 7. Proposed next step — a measurement spike (before any commitment)

Mirror `puzzle-generation-spike.md`. One throwaway script:

1. Implement **one** candidate technique end-to-end as a solver module — suggest **ALS-XZ** *or*
   **UR Type 1** (different orthogonality profiles).
2. Sample N (≈10k) random minimal puzzles. For each, record: solvable with ranks 1–15? rated tier?
   does the new technique become *strictly necessary* at any step? does it convert a previously
   `beyond-death-march` puzzle into solvable?
3. Report: (a) % of minimal puzzles that need rank 16+, (b) accept-rate / expected attempts for the
   new tier, (c) mean `rate()` time per attempt with the new technique enabled.

That gives the two numbers this whole feature hinges on — **yield** and **per-puzzle cost** — and
tells us whether the new tier is generatable inside any sane budget before we invest in solver,
coaching, and UX. It also directly informs whether Option C alone already moves the needle enough.

---

## 8. Open questions for requirements analysis (carried forward / sharpened)

- **New-tier name** — must signal genuine expert territory without hyperbole inflation above "Death
  March."
- **Is a *new tier* the goal, or just *harder puzzles*?** If the latter, Option C may satisfy it at a
  fraction of the cost. This should be settled before scoping.
- **Are uniqueness techniques acceptable?** They're the keystone of a coachable tier but rely on the
  unique-solution constraint rather than pure elimination — a philosophical call.
- **Audience & entry point** — expert-mode toggle vs. another default difficulty option. A tier this
  niche may warrant its own UX treatment.
- **Generation budget / fallback policy** — almost certainly needs revisiting; possibly a warm
  pre-gen pool or a different generation strategy for the top tier.
