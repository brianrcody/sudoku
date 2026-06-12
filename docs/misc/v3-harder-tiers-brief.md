# V3 Feature Brief & Decision Record — Harder Difficulty Tiers

**Date:** 2026-06-11
**Status:** Pre-requirements. Decisions below are agreed with the Product Director; no code written yet.
**Author:** Orchestrator (in-session), with the Product Director
**Audience:** A future Claude (or human) picking this feature up cold. Read this first, then the
deeper analysis in `v3-harder-tiers-exploration.md`.

---

## 0. How to use this document

This is the authoritative decision record for the "harder difficulty tiers" V3 feature. It captures
**what was decided and why**, the **level breakdown and naming**, and the **incremental build plan**.
It deliberately stops short of being an rspec/fspec/aspec — those come later, per the project workflow
in `CLAUDE.md`. When in doubt about a deeper point, the reasoning lives in
`v3-harder-tiers-exploration.md` (options, tensions, technique-by-technique analysis).

Companion artifacts:
- `docs/misc/v3-harder-tiers-exploration.md` — full exploration: technique bands, generation
  practicality, the central tension.
- `docs/misc/v3featureCandidates.md` — the original V3 candidate sketch (now superseded for this
  feature by this brief + the exploration doc).

---

## 1. The feature in one paragraph

Add new named difficulty tiers **above the current top tier**, and make **coaching fidelity itself a
property of the tier** — full step-by-step coaching at the lower new tier, deliberately reduced
("name the technique, highlight the key cells, state the rule, trace it yourself") at the higher new
tier, and eventually a curated top tier with no coaching at all. The product thesis: as puzzles get
harder, the techniques become structurally impossible to visualize cleanly, so coaching *honestly*
degrades. That degradation is a feature, not an apology.

---

## 2. Key facts a newcomer must understand before touching this

These are load-bearing facts about the existing engine. Get these wrong and the plan won't make sense.

1. **Rating = lowest-first, hardest-rank-wins.** `solveLogically` (`js/solver/logical.js`) walks
   `TECHNIQUES[]` (`js/solver/techniques/index.js`) in rank order, applies the *first* technique that
   progresses, restarts from rank 0, and records `hardestRank` = the max rank ever used.
   `tierForRank` maps that to a tier. The generator (`js/generator/pipeline.js`) is pure **rejection
   sampling**: fill → strip to minimal → rate → accept iff the rated tier matches, else retry up to
   `ATTEMPT_BUDGET`, then **silently** return the hardest puzzle found.

2. **Where a technique sits in the ladder *is* the design.** A new technique only changes a puzzle's
   rating if it is *strictly necessary* at some step (no lower-ranked technique can progress there).
   - Insert **above** the current ceiling → existing tiers are untouched; the new technique only fires
     on puzzles the current ladder can't crack. Clean.
   - Insert **below** the ceiling → it re-rates existing puzzles (changes what current tiers *mean*)
     and forces re-rating the curated regression set + re-tuning given-count targets/budgets.

3. **Our rank-15 "Forcing Chain (AIC)" is a *nice-loop* AIC, not a general one.**
   `forcingChains.js` `aicSearch` is a depth-≤8 DFS over single-candidate nodes that only emits an
   elimination when the chain **closes back to its start**. It misses open AICs, grouped nodes, and
   ALS nodes. Consequence: a real fraction of minimal puzzles are rejected as `beyond-death-march`
   *today* simply because this search is narrow. The logical space just above the ceiling is real and
   populated, not exotic.

4. **The coach is state-dependent and always computes the exact result.** `analyze()`
   (`js/coach/analyzer.js`, spec `aspec-coach-analyzer.md`) re-runs the solver from the current board
   on every Coach press; it does not track "where you are in a chain." Crucially, **`CoachStep`
   carries the exact `eliminations` (or placement) for every technique at every fidelity level.**
   Coaching fidelity limits the *explanation* (arrows, walk-through, the "why"), never the engine's
   knowledge of the *what*. This is why reduced-fidelity tiers still support normal
   "advance-to-next-clue" progression: the user applies the result themselves, presses Coach again,
   the analyzer re-reads the new state, and full coaching resumes on the next (usually simpler) step.

5. **The coach guides but never acts — and the trusted-erasure risk is pre-existing.** The coach
   never places or erases for the player. For elimination techniques the player records the
   eliminations themselves (pencil), and the analyzer **trusts pencil erasures as authoritative**
   (`aspec-coach-analyzer.md` §9.1). A wrong erasure can desync the coach from the true solution with
   no warning (the error gate catches wrong *pen placements*, not wrong *erasures*). This is existing,
   accepted V1/V2 behavior. Reduced-fidelity tiers make it *more likely* but introduce no new class of
   problem. **Decision: accept it; do not add an "apply for me" affordance** (see D4).

---

## 3. Decisions made (with rationale)

**D1 — XYZ-Wing, WXYZ-Wing, and finned fish go into the existing top tier (now "Expert"); AIC is
NOT bumped.**
By catalog difficulty these three sit *below* AIC (around the XY-Wing / fish band), so they can't
anchor a tier above the current ceiling — placed higher they'd almost never fire. They belong in
Expert, where they enrich the tier and make the rater more accurate. AIC stays as Expert's ceiling;
pulling it out would gut the tier and churn re-rating for no gain.

**D2 — The first new tier ("Diabolical") is anchored by Unique Rectangles, not AIC.**
URs are the one family that is simultaneously (a) genuinely above the chain ceiling — uniqueness logic
is *orthogonal* to chains, so a UR can be strictly necessary when AIC can't crack the board — and
(b) cleanly, fully coachable (4-cell visual, short, walkable). AIC is unsuitable as a "clean coaching"
anchor because it is *already* limited-coaching today (`complexity.acknowledged = true` unconditionally
for rank 15).

**D3 — Coaching fidelity is a per-tier policy, and it is allowed to be non-monotonic.**
Expert contains a limited-coaching *pocket* (the long-AIC tail, already acknowledged today), while the
harder Diabolical tier (URs) is fully coachable. We accept that fidelity does not strictly decrease
with difficulty. This is simply the nature of how technique difficulty relates to our ability to
visualize it; chasing perfect monotonicity is not worth it.

**D4 — The coach guides but never acts. No "apply the step for me" button.**
A core principle: the coach shows the player what to consider; the player must take the action. The
trusted-erasure desync risk is pre-existing and accepted (see §2.5), not a reason to let the coach
act.

**D5 — Level breakdown and naming (see §4 for the full table).**
Five total tiers below the curated one, climbing: Kiddie, Easy, Medium, Hard, **Expert** (renamed from
the old "Death March"), **Diabolical** (new), **Nightmare** (new), and eventually **Death March**
(new, curated — the name migrates up from the old top tier). The name "Death March" is deliberately
reused for the new ultimate tier.

**D6 — The curated top tier ("Death March") has no coaching because our solver genuinely can't crack
those puzzles — and it is deferred (likely V4).**
Curated Death-March puzzles require techniques our analyzer doesn't implement (Exocet, Death Blossom,
forcing nets, etc.), so `analyze()` would legitimately find no technique. Uniqueness is still
verifiable via the brute-force solver (`js/solver/uniqueness.js`), so the puzzles are valid and
rateable even though un-coachable. "No coach" is therefore a *capability* fact, not a policy choice —
and it could upgrade to "limited coach" later if those techniques are ever implemented.

---

## 4. Level breakdown

Coaching-fidelity scale used below:
- **Full** — explain + reveal candidates + walk the move (arrows/roles). Long single-candidate chains
  may show the existing acknowledged-endpoint treatment; that pocket is accepted (D3).
- **Limited** — name the technique, highlight the key cells/sets, state the rule, reveal the relevant
  candidates, but do **not** walk the inference ("trace it yourself"). This is the existing
  `complexity.acknowledged` mode, promoted to a tier-wide policy. Progression still works (§2.4).
- **None** — coach unavailable (D6).

| Order | Display name | Anchor / added techniques | Coaching | Generation model |
|---|---|---|---|---|
| 1 | Kiddie | (unchanged) | Full | Generated |
| 2 | Easy | (unchanged) | Full | Generated |
| 3 | Medium | (unchanged) | Full | Generated |
| 4 | Hard | (unchanged) | Full | Generated |
| 5 | **Expert** (was "Death March") | current ranks 12–15 **+ XYZ-Wing, WXYZ-Wing, finned X-Wing/Swordfish** | Full (long-AIC tail acknowledged) | Generated |
| 6 | **Diabolical** (new) | **Unique Rectangles** (Types 1/2/4 to start); optionally a broadened single-node AIC | Full / clean | Generated (bigger budget) |
| 7 | **Nightmare** (new) | **ALS-XZ, ALS-XY, 3D Medusa, grouped / long AIC** | Limited | Generated (much bigger budget; validate feasibility) |
| 8 | **Death March** (new, curated) | Exocet / Death Blossom / forcing-net class — beyond our solver | None | **Curated bundled library** (not generated) |

Notes:
- Tiers 6–8 are the new work. Tier 5 is a rename + enrichment (Step 0).
- The technique→tier assignment for tiers 6–7 must be confirmed by the measurement spike (§6): a
  technique only "earns" a tier if it is strictly necessary often enough for that tier to populate
  within a sane generation budget.

---

## 5. Incremental build plan

Each step is a self-contained increment that exits clean (tests pass, 100% branch coverage, Reviewer
sign-off, UX approved) per the project's iteration exit criteria.

**Step 0 — Flesh out and rename the top generated tier → "Expert".**
- Implement XYZ-Wing, WXYZ-Wing, finned X-Wing, finned Swordfish as solver techniques. The generic
  `fish(state, size, baseUnits, coverUnits)` in `js/solver/techniques/xWing.js` is the starting point
  for finned fish; `js/solver/techniques/xyWing.js` is the template for the wing variants.
- Decide insertion ranks and the Hard/Expert boundary; re-rate the curated regression set and
  re-tune `GIVEN_COUNT_TARGET` / `ATTEMPT_BUDGET` as needed.
- Add full coaching for the new techniques (clean role/arrow mappings; finned fish needs a new `fin`
  cell role — an additive change to the **sealed** `CoachStep` schema, requiring Orchestrator
  approval per `aspec-coach-analyzer.md`).
- Rename display "Death March" → "Expert"; introduce decoupled internal tier IDs and a persistence
  migration (see Open Items).
- **Note:** this is the "low step number, real blast radius" step — re-rating is the bulk of the risk.

**Step 1 — Add "Diabolical" (full coaching).**
- Implement Unique Rectangles (Type 1 first; then 2/4). Self-contained scanner; no chain machinery.
- Full coaching: 4-cell `connector-chain` rectangle, the UR digit pair, elimination targets. The
  Type-1 explanation is clean; Types 2+ each need bespoke text/roles.
- Generation: URs are orthogonal, so the tier should populate, but with a larger attempt budget —
  size it from spike data. Revisit the silent-fallback behavior so a "Diabolical" request doesn't
  routinely return a mislabeled Expert puzzle.

**Step 2 — Add "Nightmare" (limited coaching).**
- Implement ALS-XZ (and optionally ALS-XY, 3D Medusa, broadened/grouped AIC). ALS enumeration is the
  heavy lift; expect higher per-attempt solver cost.
- Coaching is **limited** by tier policy: reuse `complexity.acknowledged` to highlight the two ALS
  sets via the existing `scA`/`scB` roles + the elimination target, state the rule, and stop.
  Progression-to-next-clue works exactly as in lower tiers (§2.4).
- Generation feasibility is the open risk; the spike (§6) must confirm the tier can be generated at
  all within budget, or this step needs a different generation strategy.

**Step 3 — Add curated "Death March" (no coaching). Likely V4.**
- Source a small, hand-picked library of brutal puzzles (Exocet/Death-Blossom/net class).
- Verify uniqueness via the brute-force solver; the logical solver/analyzer will (correctly) fail to
  produce a coaching step, so the Coach button is disabled for this tier.
- This is a different content model (bundled library, not generation) and is deferred until the
  generated tiers ship.

---

## 6. Recommended first concrete action — a measurement spike

Before committing solver/coaching/UX work, run a throwaway spike (mirroring
`docs/aspecs/puzzle-generation-spike.md`) to get the two numbers the whole feature hinges on:
**yield** and **per-puzzle cost**.

1. Implement **one** candidate technique end-to-end in the solver — suggest **ALS-XZ** *or* **Unique
   Rectangle Type 1** (different orthogonality profiles).
2. Sample ~10k random minimal puzzles. For each, record: solvable with ranks 1–15? rated tier? is the
   new technique *strictly necessary* at any step? does it convert a previously `beyond-death-march`
   puzzle into solvable?
3. Report: (a) % of minimal puzzles needing rank 16+, (b) accept-rate / expected attempts for the new
   tier, (c) mean `rate()` time per attempt with the new technique enabled.

If yield is too low or cost too high for a tier, that tier needs a different generation strategy
(seeded-hard / construction) or moves to the curated model.

---

## 7. Open items to resolve in requirements / spike

- **Tier IDs & persistence migration.** Current IDs (`js/config.js` `DIFFICULTY_ORDER`) are
  `['kiddie','easy','medium','hard','death-march']`; many config maps and the stats/persistence
  layer are keyed by these strings. Reusing the "Death March" display name for a new tier while
  renaming the old one to "Expert" requires decoupled internal IDs (e.g., `expert`, `diabolical`,
  `nightmare`, plus a fresh ID for the curated tier) and a migration mapping for stored stats and
  current-difficulty. Verify against `js/persist/` and `js/providers/` before implementing.
- **Per-tier config for the new tiers.** `HINT_LIMITS`, `CHECK_VISIBLE`, `CORRECTNESS_MODE`,
  `GIVEN_COUNT_TARGET`, `ATTEMPT_BUDGET` all need entries for the new tiers (new tiers presumably
  follow the Hard/Death-March pattern: 0 hints, no Check, on-complete-silent correctness).
- **Which UR types** to implement (Type 1 confirmed; 2/4/5/6 TBD).
- **Generation budgets and silent-fallback policy** for the harder tiers (likely needs a warm
  pre-gen pool or an honest "couldn't find one" path rather than a mislabeled puzzle).
- **Coach button state** for the curated tier (explicitly disabled vs. showing a "can't help here"
  message).
- **`CoachStep` schema additions** (e.g., a `fin` role for finned fish) — additive but the schema is
  sealed; needs Orchestrator approval and an amendment to `aspec-coach-analyzer.md`.

---

## 8. Code & spec map (where to look)

| Concern | File(s) |
|---|---|
| Technique ladder (ordering = the design) | `js/solver/techniques/index.js`, `aspec-techniques.md` |
| Rating + tier mapping | `js/solver/logical.js` (`solveLogically`, `tierForRank`), `docs/misc/RatingSystem.md` |
| Existing rank-15 AIC (nice-loop only) | `js/solver/techniques/forcingChains.js` |
| Generic fish finder (basis for finned fish) | `js/solver/techniques/xWing.js` (`fish()`) |
| Wing template | `js/solver/techniques/xyWing.js` |
| Generation pipeline (rejection sampling, fallback) | `js/generator/pipeline.js`, `js/generator/rater.js` |
| Per-tier config | `js/config.js` |
| Coach analyzer + `CoachStep` schema (sealed) | `js/coach/analyzer.js`, `aspec-coach-analyzer.md` |
| Coach UI / fidelity rendering | `js/ui/coach.js`, `js/ui/coachOverlay.js`, `aspec-coach-ui.md` |
| Uniqueness check (for curated puzzles) | `js/solver/uniqueness.js` |
| Deeper analysis of this feature | `docs/misc/v3-harder-tiers-exploration.md` |
