# Code Coverage Report — V3 (Harder Difficulty Tiers)

**Date:** 2026-06-12
**Test run:** 722 passing, 0 failing, 10 pending
**Coverage tool:** c8 (V8 coverage via Playwright `page.coverage`), same pipeline and
URL-rewrite workaround as V2 (CodeCoverageV2.md §6)
**Target (per CLAUDE.md):** 100% branch coverage
**Status:** **Not met — 91.88% branch overall** (V2 baseline: 89.99%; +1.89)

---

## 1. Headline numbers

| Metric | V3 | V2 | Delta |
|---|---|---|---|
| Statement | 95.89% | 94.39% | +1.50 |
| Branch | **91.88%** | **89.99%** | +1.89 |
| Function | 95.85% | 95.67% | +0.18 |
| Line | 95.89% | 94.39% | +1.50 |

Every file added or substantially rewritten in V3 is at **100% branch**:
`xyzWing.js`, `wxyzWing.js`, `finnedFish.js`, `uniqueRectangle.js`, `alsXz.js`,
`forcingChains.js` (rewritten closures), `migrate.js`, `busy.js`, `config.js`.
Three provably-unreachable branches were removed from production rather than left
untestable (XYZ-Wing single-Z invariant; WXYZ-Wing z-cell existence and naked-quad
guard — each with a comment stating the invariant).

## 2. Remaining gaps (all carried or documented exceptions)

| File | Branch | Gap | Disposition |
|---|---|---|---|
| `main.js` | 73.33% | Fallback-dialog + cancel wiring (245–279), restore-path guards (103–109) | Bootstrap file; historically exception-listed (V1 69.76% → V2 79.24%). New paths validated manually via Playwright (see review §4.2) and covered at the layers below (W8, PP10, UB1–8) |
| `analyzer.js` | 85.97% | Pre-existing V2 gaps (hinge fallback, defensive guards) **plus** the XY-Chain short-arm (1156–1161) and Forcing-Chain short-arm | Sound chains are depth-biased: 20k+ mined boards produced no short-chain first-fire. The arms mirror the covered long arms; documented in review §4.1 |
| `state.js` | 85.65% | Pre-existing V2 reducer guard gaps (unchanged lines) | Carried from V2 |
| `clientGenProvider.js` | 90.47% | Worker-error path, fallback console.warn, storage catch | Carried from V2 (same lines) |
| Various UI files | as V2 | Pre-existing defensive guards | Carried from V2 |

## 3. New coverage assets

- **Soundness sweep** (`soundness.test.js`): 40 seeded random minimal puzzles per run,
  full 21-rank ladder, zero-unsound assertion + anti-dead-code fire checks. This is the
  test class that would have caught the V2 XY-Chain unsoundness and the dead rank-15
  closures (`bugs-forcing-chains-soundness.md`).
- **Mined rank-clean coach fixtures** for all six new techniques plus re-mined
  SC/MC/XYC-long/FC fixtures (the pre-V3 boards were no longer rank-clean under the
  21-rank ladder); UR Types 2 and 4 have dedicated fixtures covering their text branches.

## 4. Reproducing

Identical to CodeCoverageV2.md §6 (npm test → URL-rewrite → `npx c8 report`).
