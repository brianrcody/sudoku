# Test Strategy — Harder Difficulty Tiers (V3)
**Date:** 2026-06-12
**Author:** Uber Developer (QE Strategist stage)
**Inputs:** rspec-003, fspec-003, aspec-harder-tiers.md

---

## 1. Approach

Three layers, matching the feature's risk profile:

1. **Soundness sweep (new layer, rspec R24).** Fixture tests prove a technique fires
   correctly on known patterns; they cannot prove it never fires *incorrectly*. The sweep
   generates seeded random minimal puzzles (unique solutions known) and asserts no ladder
   step ever contradicts the solution. This is the layer that would have caught the V2
   XY-Chain defect, so it is permanent and runs with the unit suite.
2. **Unit tests** for every new module and changed behavior: technique scanners (synthetic
   candidate states, verified against the modules before freezing), migration, config,
   provider resolve shape, reducer actions, busy UI, coach mappers (mined rank-clean
   fixtures through the real `analyze()`).
3. **Integration/perf** kept thin: worker fallback round-trip, seeded generation-time
   gates, and the existing iframe perf harness extended to the new tiers.

## 2. Inventory (delta to the V1/V2 suites)

| Area | Tests | Type | Covers |
|---|---|---|---|
| `soundness.test.js` SND1 | 40 seeded minimal puzzles, full ladder | unit (randomized, deterministic seeds) | No unsound elimination/placement; anti-dead-code fire assertions |
| `xyzWing.test.js` XYZ1–4 | 3 firing + 1 null | unit | Row/col/box orientations, subset guard |
| `wxyzWing.test.js` WXYZ1–5 | 3 firing + 2 null | unit | Bent-set rule, both bent-violation arms |
| `finnedFish.test.js` FXW1–3, FSF1, FN1 | 4 firing + 1 null | unit | Row/col orientations, multi-fin, sashimi, fin-box eliminations only |
| `uniqueRectangle.test.js` UR1–7 | 3 firing + 3 null | unit | Types 1/2/4 eliminations + extra fields; 4-box, incomplete-roof, degenerate guards |
| `alsXz.test.js` ALS1–4 | 3 firing + 1 null | unit | Set shapes (1+2, 2+2), restricted-common guard |
| `index.test.js` TI1–2 | 2 | unit | 21-rank ladder order |
| `rater.test.js` R3/R5/R6/R8 (updated) | 4 | unit | New tier boundaries incl. diabolical/nightmare/beyond-nightmare |
| `logical.test.js` L3 (re-fixtured) | 1 | unit | Honest medium fixture (the old one was mis-labeled and conditionally asserted) |
| `migrate.test.js` MG1–6 | 6 | unit | All four migrations, no-ops, idempotence |
| `cookieStatsStore.test.js` CS1–9 (updated +2) | 9 | unit | 7-tier map; legacy death-march fold-in (fresh + merge) |
| `state.test.js` S49a–c (added) | 3 | unit | SET_GENERATING difficulty, GEN_PROGRESS gating, reset on load |
| `ui-busy.test.js` UB1–7 | 8 | unit | Card lifecycle, 3 s delay, progress text, Cancel hook, SR-safe defaults |
| `ui-stats.test.js` / `ui-controls` (updated) | — | unit | 7 rows/options, new labels |
| `puzzleProvider.test.js` PP1/2/9/10 (updated) | 4 | unit | `{puzzle, fallback}` resolve shape, cache-hit fallback=false |
| `coach/analyzer.test.js` (6 new groups + re-ranked groups + enabled FC) | ~50 assertions | unit | All six new mappers incl. `fin` role, UR rectangle, ALS limited policy; schema completeness incl. `fin` |
| `worker.test.js` W8 (updated) | 1 | integration | fallback=true on seeded diabolical budget miss |
| `pipeline.test.js` PL8/11 (updated), PL12/13 (new) | 4 | unit/perf | Expert budget path; seeded diabolical < 20 s; seeded nightmare < 15 s |
| `perf.test.js` (expert + nightmare rows) | 6 tiers | system/perf | UI-path New Puzzle within per-tier budgets |

## 3. Coverage map

- Every new technique module: all branches via firing + null fixtures; provably-dead
  branches were removed from production rather than left untestable (XYZ single-Z
  invariant, WXYZ z-cell-existence and naked-quad guards).
- Coach mapper branches: mined rank-clean fixtures per technique; UR Type 2/4 text arms
  and the Forcing-Chain short-chain arm covered by dedicated mined fixtures.
- Migration: every branch in `migrate.js` and the `cookieStatsStore` legacy fold-in.
- Known accepted gaps (documented in CodeCoverageV3.md): `main.js` fallback-dialog and
  cancel wiring (bootstrap file, historically exception-listed; manually validated),
  provider worker-error paths (pre-existing exception).

## 4. Risks / notes for the test runner

- Generation-time tests are seeded; engine changes that alter the solve path will shift
  which attempt hits a tier and may need re-seeding (PL12/PL13, W8 comments carry the
  seeds).
- The soundness sweep's 40-board size is a runtime compromise (~6 s in-browser); the
  10k-scale sweep lives in `scripts/spike-harder-tiers/` for ad-hoc deep verification.
- Diabolical UI-path generation is intentionally not in the per-run perf suite (accept
  rate ~0.8%/attempt makes unseeded timing flaky); PL12 (seeded) plus the manual
  measurement in PerformanceV3.md own that budget.
