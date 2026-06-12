# V3 Implementation Report — Harder Difficulty Tiers (Steps 0–2)

**Date:** 2026-06-12
**Author:** Uber Developer
**Status at time of writing:** implemented, 722/722 tests passing, Reviewer sign-off
issued, all docs written. Everything after the mockup approval sits **uncommitted** in
the working tree per the Product Director's instruction (explicit approval required for
every commit). Commits already landed before that instruction: `192b2e4` (solver
soundness fix), `4844db8` (rspec + spike), `6d71e0c` (fspec + mockup).

---

## What shipped (working tree)

**Engine — the 21-rank ladder.** Ranks 1–11 untouched; XYZ-Wing, WXYZ-Wing, Finned
X-Wing, Finned Swordfish inserted at 12–15 (inside Expert, so Kiddie–Hard ratings are
provably unchanged and Expert membership is preserved as a set); coloring/chains shifted
to 16–19; Unique Rectangle (Types 1/2/4) at 20 anchors **Diabolical**; ALS-XZ at 21
anchors **Nightmare**. Validated by a 1,500-board sweep: zero unsound steps, every
technique fires, Diabolical accepts at ~0.8%/attempt (UR Types 2/4 roughly doubled the
spike's Type-1-only yield).

**Tiers & migration.** Internal IDs are now `expert`/`diabolical`/`nightmare` with
display names in one `TIER_LABELS` map. One-time idempotent migration: stats cookie
folds `death-march` into `expert`, difficulty pref and saved games rewrite, and the
stale pre-V3 cached puzzle is discarded (it was rated by the unsound rater).

**Generation UX.** For the two new tiers, the busy state grows the progress line +
Cancel after 3 s (with the fspec §9.3 focus handoff — a gap the review pass caught and
fixed); budget exhaustion now opens the honest "No Nightmare puzzle found… Play Expert?"
dialog instead of silently mislabeling. With Diabolical's 2,000-attempt budget the
dialog is a ~1-in-10⁷ event; expected cold start measured at **~9 s in-browser** against
the approved 120 s envelope.

**Coach.** Six new mappers, including the sealed-schema amendment (`roles.fin`, rank
1–21 — amendment recorded in `aspec-coach-analyzer.md`). ALS-XZ implements the
limited-fidelity policy: groups highlighted, rule stated, no arrows, "trace it yourself"
note. Verified live: a Nightmare board correctly gives *full* coaching for its simple
steps (per-technique fidelity, fspec §7.3).

## Two things worth knowing

1. **The V2 test suite had load-bearing weasel assertions.** Beyond the solver fixes
   (unsound XY-Chain; dead rank-15 Forcing Chain — see
   `bugs-forcing-chains-soundness.md`), several fixtures only "passed" via conditionals
   that never ran — the L3 "medium" fixture actually requires Unique Rectangle logic,
   and the rank-15 coach test was commented out because Forcing Chain could never fire.
   All replaced with generator-mined, strictly-asserted fixtures; the randomized
   soundness sweep is now a permanent suite member (rspec-003 R24).
2. **Sound XY-Chains are almost always long.** The depth-biased DFS means rank-18
   coaching will nearly always use the acknowledged/elided treatment (20k mined boards
   produced no short first-fire chain). Noted in the review as a possible future
   improvement (breadth-first chain search would give friendlier coaching).

## Verification

- **Tests:** 722 passing / 0 failing / 10 pending (was 647). Branch coverage **91.88%**
  vs V2's 89.99%; every V3 module is at 100%, remaining gaps are V2-carried exceptions
  documented in `CodeCoverageV3.md`.
- **Perf:** all PERF gates green; seeded Diabolical 9.2 s, Nightmare 3.4 s
  (`PerformanceV3.md`).
- **Live check:** Playwright boot — 7-tier selector, Nightmare generation, stats table
  with Expert continuity, coach flow, zero console errors.

## Document map

| Artifact | Location |
|---|---|
| Requirements spec | `docs/rspecs/rspec-003-harder-tiers.md` |
| Functional spec | `docs/fspecs/fspec-003-harder-tiers.md` |
| Visual spec / approved mockup | `docs/vspecs/vspec-003-harder-tiers.md` / `docs/mockups/harder-tiers-v1.html` |
| Architecture | `docs/aspecs/aspec-harder-tiers.md` (+ `aspec-overview.md`, `aspec-coach-analyzer.md` amendments) |
| Test strategy | `docs/tspecs/tspec-harder-tiers.md` |
| Review sign-off | `docs/misc/review-harder-tiers-v1.md` |
| Coverage / performance / test summary | `docs/misc/CodeCoverageV3.md`, `PerformanceV3.md`, `test-summary-harder-tiers.md` |
| Solver bug report | `docs/misc/bugs-forcing-chains-soundness.md` |
| Measurement spike | `docs/misc/v3-harder-tiers-spike.md` (+ `scripts/spike-harder-tiers/`) |
| Fixture miner | `scripts/mine-coach-fixtures.js` (+ `docs/misc/coach-fixture-tracker.md`) |

Step 3 (curated "Death March", coach disabled) remains deferred to V4 as planned.

To try it: open `index.html`, pick Diabolical or Nightmare, hit New Puzzle — the first
generation shows the progress card; after that the pre-gen cache makes it instant.
