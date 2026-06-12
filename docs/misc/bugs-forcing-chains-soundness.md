# Bug Report — Soundness Defects in `forcingChains.js` (XY-Chain & Forcing Chain)

**Date:** 2026-06-12
**Found during:** V3 harder-tiers measurement spike (pre-implementation soundness sweep)
**Status:** Fixed; full suite green (647 passing / 0 failing). Awaiting Reviewer pass in the
V3 Step 0 cycle.
**Files changed:** `js/solver/techniques/forcingChains.js` (production only; no test changes
required — all 647 existing tests pass unmodified)

---

## 1. How these were found

The harder-tiers spike includes a soundness sweep: run the technique ladder over random
minimal puzzles (known unique solution) and assert that no technique ever eliminates the
true solution digit from a cell, and no placement contradicts the solution. This sweep is
not part of the existing suite — existing technique tests assert behavior on hand-built
fixtures, which is why these defects survived V1/V2.

Sweep harness: `scripts/spike-harder-tiers/sanity.js` (throwaway, but the sweep itself is a
strong candidate for promotion into the permanent suite during V3 Step 0).

## 2. Defect A — XY-Chain unsound termination (severity: HIGH)

**Symptom:** With the production ladder alone, **127 of 1000** random minimal puzzles
(12.7%) received at least one elimination that removed the puzzle's true solution digit.
Every first-unsound step was XY-Chain.

**Root cause:** `xyChainDFS` accepted a chain endpoint that merely *contained* the
elimination digit z (`candidates[next] & zBit`). The XY-Chain argument requires the chain
to *force* z at the endpoint: having entered the final cell via the link digit, the cell's
other candidate must be z (`nextExit === z`). When the entry digit itself equals z, the
chain proves the endpoint is **not** z, yet the code still eliminated z from all cells
seeing both ends.

**User-facing impact (pre-fix):**
- Mis-rated puzzles: ratings derived from impossible eliminations.
- Generation: corrupted solves distorted accept/reject decisions and the silent-fallback
  ranking.
- **Coach:** on an affected board state, Coach could instruct the player to erase a pencil
  mark that is the true solution digit — an unrecoverable desync the error gate does not
  catch (it only catches wrong pen placements).

**Fix:** termination condition changed to `nextExit === z`.

**Verification:** soundness sweep 0/1000 unsound post-fix (was 127/1000).

## 3. Defect B — Forcing Chain (AIC) closures unreachable: rank 15 was dead code (severity: HIGH)

**Symptom:** Forcing Chain produced **zero** results in 1500 random minimal puzzles — even
when promoted ahead of XY-Chain so it got first attempt at every stall.

**Root cause:** in both closure paths of `aicSearch`, the revisit guard
(`path.some(p => p.cell === X && p.digit === last.digit)`) executed **before** the
loop-closure check. Closing a loop requires returning to the start node — which is always
in the path — so the closure branches were unconditionally skipped. `forcingChain` could
never return a result on any input.

**Consequences (pre-fix):**
- The "Death March requires Forcing Chain (AIC)" tier description was fiction; the tier was
  anchored in practice by ranks 12–14.
- Existing tests passed because they were written permissively ("returns result **or null**
  without throwing") — they never asserted a fire.

## 4. Defect C — Forcing Chain closure eliminations mis-derived (severity: HIGH, masked by B)

Had the closures been reachable, both would have produced unsound eliminations:

- **Strong-link closure ("type 1"):** the DFS's link parity (weak/strong alternating,
  starting weak, closing strong) always forms a **continuous** nice loop. The code treated
  it as a two-strong-links discontinuity and eliminated all other candidates at the start
  cell — valid only in the discontinuity case, which this DFS cannot construct. The sound
  continuous-loop eliminations are: for each weak link in the loop on digit d, eliminate d
  from outside cells seeing both of that link's endpoints.
- **Weak-link closure ("type 2"):** the chain proves startDigit false **at the start cell
  only** (assumption propagates around the loop to a contradiction). The code instead
  eliminated the digit from all *peers* of the start cell, which the argument does not
  support, and left the start cell itself untouched.

**Fix:** closure checks moved ahead of the revisit guard (resolving B); strong-link closure
now emits the continuous-loop weak-link eliminations; weak-link closure now emits exactly
`{startCell, startDigit}`.

**Verification:** post-fix sweep over 1000 random minimal puzzles: Forcing Chain fired 111
times, XY-Chain 249 times, **zero unsound steps**. Full suite: 647 passing / 0 failing.

## 5. Rating-semantics impact

- **Defect A fix** (XY-Chain finds strictly fewer eliminations): only affects boards where
  rank 14 previously fired — i.e., death-march-rated and beyond. Lower tiers cannot be
  affected (lowest-first ladder). Some previously "death-march" puzzles may now rate
  `beyond-death-march` (they were never logically solvable with sound techniques).
- **Defect B/C fix** (rank 15 goes from never-firing to firing): only *adds* solving power
  at the top of the ladder; converts some previously `beyond-death-march` boards into
  rank-15 death-march. Cannot re-rate any board solvable without rank 15.
- Net measured effect on random minimal puzzles: ~14.5% remain beyond the (now sound)
  ceiling.
- All existing rated fixtures and the regression set still pass unmodified, so the
  practical re-rating blast radius on curated content is zero.

**Residual risk:** users' pre-generated/localStorage-cached puzzles were labeled by the
unsound rater. A cached "Death March" puzzle may not be logically solvable by the sound
ladder; the coach would correctly report no available technique at the stall point. This is
bounded by the existing "no technique found" handling and washes out as caches refresh.

## 6. Follow-ups routed to V3 Step 0

1. Promote the soundness sweep into the permanent test suite (deterministic seeds).
2. Replace the permissive AIC tests with fixtures that assert real fires (both closure
   types) and sound eliminations.
3. Re-validate coach rendering of Forcing Chain steps now that `chain.nodes` paths are
   produced by real closures (shape unchanged; lengths may differ).
