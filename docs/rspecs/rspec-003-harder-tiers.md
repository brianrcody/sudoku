# Requirements Spec: Harder Difficulty Tiers
**ID:** rspec-003-harder-tiers
**Status:** Approved decisions per `docs/misc/v3-harder-tiers-brief.md`; authored by the
Uber Developer for the V3 cycle
**Date:** 2026-06-12
**Author:** Uber Developer (from the Product-Director-approved brief)

---

## 1. Overview

V3 adds new named difficulty tiers above the current top tier, with **coaching fidelity as
a per-tier property**: full step-by-step coaching at the lower new tier, deliberately
limited ("name it, highlight it, state the rule — trace it yourself") at the higher new
tier. The degradation is honest: harder techniques are structurally impossible to visualize
with the linear-arrow coaching vocabulary, and the product embraces that rather than
apologizing for it.

This rspec covers the brief's Steps 0–2 (generated tiers). Step 3 — the curated "Death
March" bundled-library tier with no coaching — is deferred (likely V4) and appears here
only where forward compatibility demands it.

Authoritative background: `docs/misc/v3-harder-tiers-brief.md` (decision record D1–D6),
`docs/misc/v3-harder-tiers-exploration.md` (analysis), and the spike report
`docs/misc/v3-harder-tiers-spike.md` (yield/cost measurements gating Steps 1–2).

---

## 2. Tier Structure

**R1.** The difficulty ladder becomes, in ascending order: Kiddie, Easy, Medium, Hard,
**Expert**, **Diabolical**, **Nightmare**. (A future curated tier named "Death March" will
sit above Nightmare; it is out of scope for V3 but must not be precluded.)

**R2.** "Expert" is the renamed current top tier ("Death March"). Existing tiers Kiddie
through Hard are unchanged in name and meaning.

**R3.** Internal tier identifiers are decoupled from display names. The current internal ID
`death-march` is retired in favor of `expert`; the new tiers get fresh internal IDs. The
display name "Death March" is reserved for the future curated tier.

**R4.** Persisted user data keyed by the old `death-march` ID (statistics, current
difficulty, cached/in-progress puzzles) migrates losslessly to `expert`. Migration is
one-time, automatic, and invisible to the user.

**R5.** All per-tier configuration (hint limits, Check visibility, correctness mode,
given-count targets, generation budgets) gains entries for the new tiers. Diabolical and
Nightmare follow the Hard/Expert pattern: 0 hints, no Check button, on-complete-silent
correctness.

---

## 3. Tier Content (technique ladder)

**R6.** Expert is enriched with four new fully-coached techniques inserted at their true
catalog ranks below the chain techniques: **XYZ-Wing**, **WXYZ-Wing**, **finned X-Wing**,
**finned Swordfish** (per D1). The AIC ceiling of Expert is unchanged.

**R7.** Diabolical is anchored by **Unique Rectangles** (Type 1, 2, and 4), inserted above
the current rank-15 ceiling (per D2). A UR must be strictly necessary for a puzzle to rate
Diabolical.

**R8.** Nightmare is anchored by **ALS-XZ** (and optionally further ALS-class or coloring
extensions if the spike shows ALS-XZ alone under-populates the tier), inserted above the UR
band. An ALS-class technique must be strictly necessary for a puzzle to rate Nightmare.

**R9.** Technique→tier assignment is confirmed by spike measurement: a technique earns its
tier only if strictly necessary often enough for the tier to populate within the generation
envelope (§5). If measurement contradicts the assignment above, escalate to the Product
Director before re-scoping.

**R10.** Existing puzzles' ratings at tiers Kiddie–Hard must be unaffected by the new
techniques (insertion above the existing ladder where required; Expert-internal insertions
may re-rate only within the Hard/Expert boundary, validated against the curated regression
set).

---

## 4. Coaching Policy (per tier)

**R11.** Coaching fidelity is a per-tier, per-technique policy (D3):
- Kiddie–Expert: full coaching as today. The existing long-chain
  `complexity.acknowledged` treatment for rank-15 chains remains (the accepted
  "limited pocket" inside Expert).
- Diabolical: full coaching, including the new UR techniques (4-cell rectangle visual,
  the digit pair, elimination targets).
- Nightmare: ALS-class steps are **limited-fidelity** — name the technique, highlight the
  two cell sets and the elimination target, state the rule, reveal relevant candidates, do
  not walk the inference. Steps at Nightmare that use lower-ladder techniques remain fully
  coached.

**R12.** Limited fidelity constrains the *explanation only*. The engine always computes the
exact placements/eliminations; advance-to-next-clue progression works identically at every
tier (brief §2.4).

**R13.** The coach guides but never acts (D4). No "apply this step for me" affordance. The
pre-existing trusted-erasure desync risk is accepted as-is.

**R14.** New coach visuals required by the new techniques (e.g., a `fin` cell role for
finned fish; UR rectangle treatment) are additive amendments to the sealed `CoachStep`
schema, documented in `aspec-coach-analyzer.md` per its amendment process.

---

## 5. Generation

**R15.** Diabolical and Nightmare are generated (not curated), using the existing
rejection-sampling pipeline with per-tier budgets sized from spike data.

**R16.** Generation envelope (Product Director, 2026-06-12): a wait of up to **120 seconds**
is acceptable for the new tiers when no pre-generated puzzle is available. Within that
envelope the user must get a **correctly labeled** puzzle of the requested tier with very
high probability.

**R17.** The silent-mislabel fallback (returning the hardest-found puzzle labeled as
requested behavior's tier) is not acceptable for Diabolical/Nightmare. If the envelope is
exhausted without a qualifying puzzle, the user is told honestly and offered the hardest
puzzle found, clearly labeled with its true tier. Exact UX left to the Functional Designer.

**R18.** Background pre-generation and the localStorage cache extend to the new tiers so
the 120-second cold-start path is the exception, not the rule.

**R19.** During any generation wait longer than the current tiers', the UI shows progress
(existing worker progress mechanism) and remains fully responsive; generation remains
cancellable.

**R20.** If spike/implementation measurement shows a tier cannot meet R16 with rejection
sampling, escalate to the Product Director with alternatives (different generation strategy
or tier re-scoping) before building UX around longer waits.

---

## 6. UX Surface

**R21.** The difficulty selector presents all seven tiers in ascending order with the new
display names. Selector behavior (confirmation on switch, etc.) is unchanged.

**R22.** Statistics tracking and display extend to the new tiers, including the renamed
Expert tier's continuity with historical death-march stats (R4).

**R23.** Visual treatment of the new tier names and any new generation-wait/fallback UI
goes through the standard mockup → user approval → vspec flow.

---

## 7. Quality Gates

**R24.** Soundness: every solver technique added or touched in this cycle must pass the
randomized soundness sweep (no elimination of a true-solution digit; no placement
contradicting the unique solution) in addition to fixture tests. The sweep joins the
permanent suite (see `docs/misc/bugs-forcing-chains-soundness.md` for motivation).

**R25.** All standard iteration exit criteria apply per project CLAUDE.md (tests pass,
branch coverage target, Reviewer sign-off, performance, a11y).

**R26.** Performance: non-generation user actions stay under 1 s. Generation budgets per
tier are validated against R16 on a mid-range device baseline.

---

## 8. Out of Scope

- The curated "Death March" tier (Step 3, V4): bundled puzzle library, disabled coach.
- Catalog-completeness re-ranking of techniques below the current Hard/Expert boundary
  (exploration Option B) beyond what R6 requires.
- Any server-side generation.
