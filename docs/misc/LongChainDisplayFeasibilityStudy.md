# Long Chain Display — Feasibility Study
**Date:** 2026-05-22
**Status:** Backlog candidate — not pursued in V2
**Context:** Pre-Reviewer discussion before V2 work began. The question was whether it would be possible to allow users to opt in to seeing a full chain visualization for XY-Chain and Forcing Chain techniques, rather than the current endpoint-only truncated view.

---

## Background

For complex chain techniques (XY-Chain rank 14, Forcing Chain rank 15), the coach currently shows only the two chain endpoints when the chain exceeds `COMPLEXITY_THRESHOLD = 6` cells. The coaching panel acknowledges this explicitly ("This is a long chain — the highlights show the endpoints. Trace the links yourself to verify."). The question: could the user opt in to seeing the full chain by clicking a button in the coaching panel?

---

## Why Chains Are Currently Truncated

Three distinct factors drive the current behavior:

**1. Visual clutter — the primary driver.**
A Forcing Chain can span 10–20 cells. Rendering all of them highlighted simultaneously means a large fraction of the grid is colored `.coached-cause`. More critically, the chain-edge arrows connecting all interior nodes would crisscross the 9×9 grid, producing a tangle. The truncated view (endpoints only, one dashed arrow) is a deliberate trade: sacrifice detail for clarity.

**2. A data trimming decision in the analyzer.**
The solver does compute the full chain — `forcingChains.js` produces the complete ordered `path` and `xyChainDFS` produces the ordered cell list. The analyzer receives this data. In long-chain mode it intentionally trims `roles.cause` to two entries and replaces the full `chain-edge` arrow list with a single dashed endpoint arrow. The full chain data is available at mapper time but is currently discarded. This is a policy choice that could be reversed, not a fundamental limitation.

**3. `CoachStep` is a sealed schema.**
The contract between `aspec-coach-analyzer.md` and `aspec-coach-ui.md` is explicit: `CoachStep` cannot be modified without Orchestrator approval. Any "store the full chain" approach requires unsealing. That is a process gate, not a technical blocker.

---

## Feasibility of an Opt-In "Show Full Chain" Button

**Assessment: feasible, moderate effort, one non-trivial design decision.**

### Required changes

**Analyzer (small):** In long-chain mode, instead of discarding the full chain, store it in a new optional field alongside the truncated endpoint data — e.g., `complexity.fullChain: { cause: int[], arrows: Arrow[] }`. The data is already in hand; it just needs to be preserved. Requires unsealing `CoachStep` for an additive field.

**UI / coachOverlay (moderate):** Add a "Show full chain" button to the coaching panel, visible only when `complexity.acknowledged === true`. Clicking it toggles a local rendering mode in `coach.js` — this does not touch `GameState` or the reducer. The overlay renderer reads `complexity.fullChain` and swaps in the full arrow set.

### The non-trivial design decision: auto-reveal for interior chain cells

The current `autoReveal` mechanism reveals candidates in cells referenced by `roles.cause`. It runs at `COACH_START` and is tracked by `coachRevealedBits` for clean revert on session end. If full-chain mode highlights interior cells, the question is whether those cells' candidates should be auto-revealed.

**Option A — Reveal on opt-in (button click):** Revealing at button-click time rather than `COACH_START` requires a new reducer action and changes to the pencil revert logic. Moderate complexity.

**Option B — Highlight only, no reveal:** Just highlight the interior cells visually without touching pencil marks. No reducer changes. This is the simpler path and is probably pedagogically correct — opting in to see the full chain implies the user wants to trace it themselves. Interior cells are not referenced by the technique's explanation, so revealing their candidates is not strictly necessary.

Option B is the recommended implementation path.

---

## Risk Summary

| Risk | Severity | Notes |
|---|---|---|
| Arrow visual clutter remains even when opted in | Medium | A 15+ node chain is still hard to follow. Interior chain-edge arrows should be rendered at reduced opacity vs. endpoint arrows to create visual hierarchy. |
| Schema unseal process overhead | Low | Additive change; straightforward Architect/Orchestrator review. |
| Pencil reveal complexity | Medium | Avoidable entirely via Option B (highlight only, no reveal). |
| Test coverage delta | Low | New `fullChain` field needs fixtures; long-chain tests already exist for the truncated case. |

---

## Conclusion

The original truncation decision was driven 80% by UI legibility and 20% by schema simplicity. Neither is a fatal blocker for the opt-in idea.

The cleanest implementation path: store `complexity.fullChain` in the analyzer (additive schema change requiring an unseal), render it on button click via a local UI toggle in `coach.js`, highlight interior cells without auto-revealing their candidates (Option B), and render interior chain edges at reduced opacity for visual hierarchy. This avoids touching the reducer entirely and leaves the pencil revert logic unchanged.

No hard technical blockers were found. The feature is deferred to a future backlog consideration.
