# V3 Harder Tiers — Measurement Spike Report

**Date:** 2026-06-12
**Author:** Uber Developer
**Inputs:** `v3-harder-tiers-brief.md` §6 (spike definition), 120-second generation envelope
(Product Director, 2026-06-12)
**Harness:** `scripts/spike-harder-tiers/` (throwaway) — UR Type 1 + ALS-XZ implemented as
candidate solver modules; 10,000 random minimal puzzles sampled (seeded, reproducible:
`node scripts/spike-harder-tiers/run.js 10000 424242`).

---

## 1. Headline: both new tiers are generatable well inside the envelope

| Prospective tier | Anchor | Accept rate per attempt | Expected attempts | Expected time (Node) | p99 time (Node) |
|---|---|---:|---:|---:|---:|
| Diabolical | UR strictly necessary (hardest rank 16) | **0.49%** | ~204 | ~4.5 s | ~21 s |
| Nightmare | ALS-XZ strictly necessary (hardest rank 17) | **6.11%** | ~16 | ~0.4 s | ~1.6 s |

Mean cost per generation attempt ≈ 22 ms (strip 13.3 ms + rate 2.9 ms + extended search on
the ~14.5% of attempts that stall, ~42 ms each). Even at a conservative 3× browser-vs-Node
factor, Diabolical's p99 lands around one minute — inside the 120 s envelope — and the
expected case is ~15 s. With background pre-generation, cold-start waits will be rare.
**Conclusion: rejection sampling survives for both tiers; no alternative generation strategy
needed. R16/R20 satisfied; the R9 escalation is not triggered.**

## 2. The baseline had to be fixed first (major incidental finding)

The spike's soundness sweep exposed pre-existing production defects in
`js/solver/techniques/forcingChains.js` — see `bugs-forcing-chains-soundness.md`:

1. **XY-Chain was unsound** — eliminated true-solution digits on 12.7% of random minimal
   puzzles (unsound termination condition). Fixed.
2. **Forcing Chain (rank 15) was dead code** — its loop closures were unreachable, so it
   never fired on any input; "Death March requires AIC" was fiction. Fixed.
3. **Its closure eliminations were also mis-derived** (would have been unsound had they
   been reachable). Rewritten to sound nice-loop semantics.

All numbers in this report are measured on the **fixed** engine (sweep-verified: 0 unsound
steps in 1000 boards; suite green: 647/647).

## 3. Distribution of 10,000 random minimal puzzles (sound ladder, ranks 1–15)

| Rating | Count | % |
|---|---:|---:|
| kiddie | 108 | 1.1 |
| easy | 4064 | 40.6 |
| medium | 1879 | 18.8 |
| hard | 441 | 4.4 |
| death-march (→ Expert) | 2062 | 20.6 |
| beyond-death-march | 1446 | **14.5** |

Given counts: mean 24.4, p99 27. The logical space above today's ceiling is large and
populated, confirming exploration §2.2.

## 4. What cracks the beyond-band (1,446 boards)

| Ladder extension | Boards solved | % of stalled | % of all attempts |
|---|---:|---:|---:|
| + UR Type 1 only | 49 | 3.4 | 0.49 |
| + ALS-XZ only | 634 | 43.8 | 6.34 |
| + both (UR rank 16, ALS rank 17) | 660 | 45.6 | 6.60 |
| still unsolved with both | 786 | 54.4 | 7.86 |

With the combined ladder: hardest rank 16 (UR is the ceiling) on 49 boards; hardest rank 17
(ALS needed) on 611; UR fired at least once on 86.

**Surprise vs. the brief's expectations:** the exploration predicted URs would be the
frequently-necessary keystone and ALS the rare expensive one. Measurement inverts that:
ALS-XZ is strictly necessary on 6.1% of all minimal puzzles, UR Type 1 on only 0.5%. Both
tiers still work as designed — the ordering (Diabolical = UR below Nightmare = ALS) matches
human-difficulty catalogs, and both populate within budget — but Diabolical is the thin
tier, not Nightmare. Implications:

- Diabolical's attempt budget must be sized ~2,000 (P(miss) < 0.01%); Nightmare's ~300.
- Adding UR Types 2/4 (planned for Step 1) will raise Diabolical's 0.49% somewhat (UR fired
  on 86 stalled boards but was hardest on only 49).
- The 7.9% still-unsolved band is ample headroom for future extensions (ALS-XY, Medusa,
  grouped AIC) and the eventual curated tier.

## 5. Measurement caveats

- UR measured as **Type 1 only**; Types 2/4 will add yield (direction favorable).
- ALS-XZ capped at sets of ≤ 4 cells; uncapped search adds yield (direction favorable) at
  some cost (acceptable — Nightmare is nowhere near budget-bound).
- Timing measured in Node 18 on the dev machine; browser/worker factor assumed ≤ 3×.
  Validate against the perf harness during Step 1/2 implementation.
- Random minimal puzzles (strip to minimality, mean 24.4 givens) approximate the production
  pipeline's behavior for top tiers; per-tier `GIVEN_COUNT_TARGET` tuning may shift accept
  rates slightly.

## 6. Decisions this data supports

1. **Proceed with Steps 0–2 as planned** (tier assignments confirmed; generation feasible).
2. Proposed production ladder (final ranks decided in the Step 0/1/2 aspecs):
   ranks 1–11 unchanged; XYZ-Wing, WXYZ-Wing, finned X-Wing, finned Swordfish inserted
   between XY-Wing and Simple Coloring (all inside Expert, preserving Kiddie–Hard ratings
   *exactly* and Expert membership as a set); UR above the chains (Diabolical); ALS-XZ above
   UR (Nightmare).
3. Generation: keep rejection sampling; honest fallback per rspec R17; budgets ~2,000
   (Diabolical) / ~300 (Nightmare), re-validated in-browser during implementation.
