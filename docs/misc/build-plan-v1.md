# Build Plan — Sudoku v1

**Date:** 2026-04-19  
**Status:** Ready to execute

---

## Overview

Two parallel Implementors split at the puzzle/app interface boundary, with a QE Strategist
running concurrently. A brief Foundations phase precedes the parallel split. Reviewers work
independently per track; integration validation runs after both sign off.

---

## Phase 0 — Foundations (prerequisite, single implementor)

**Files:** `prng.js`, `util/grid.js`, `util/bitset.js`, `util/events.js`

These four modules are tiny, needed by both tracks, and have no dependencies on anything
else. Run one Implementor agent (sonnet) to knock them out first. No meaningful delay before
the parallel split.

---

## Phase 1 — Parallel: Puzzle Brain + App Brain + QE Strategist

All three agents run simultaneously after Foundations land.

### Puzzle Brain Implementor (sonnet)

Aspec phases 2–4. Owns all algorithmic machinery.

| Phase | Files |
|---|---|
| 2 — Technique ladder | `solver/uniqueness.js`, `solver/candidates.js`, `solver/techniques/*`, `solver/logical.js` |
| 3 — Generator | `generator/fillGrid.js`, `generator/removeCells.js`, `generator/rater.js`, `generator/pipeline.js` |
| 4 — Worker + Provider | `worker/protocol.js`, `worker/generator.worker.js`, `providers/puzzleProvider.js`, `providers/clientGenProvider.js` |

Milestone exits per aspec §17:
- Phase 2: solver correctly rates 100% of a curated 50-puzzle regression set.
- Phase 3: `generateForTier` produces correctly-rated puzzles for all five tiers within budget.
- Phase 4: Worker round-trip integration test passes.

### App Brain Implementor (sonnet)

Aspec phases 5–6. Codes against stubs for `PuzzleProvider` and `SolverHintProvider` — both
interfaces are fully specified in aspec §4.16 and §4.18.

| Phase | Files |
|---|---|
| 5 — Game core | `game/state.js`, `game/conflicts.js`, `game/correctness.js`, `game/statistics.js`, `persist/cookies.js`, `persist/storage.js`, `providers/cookieStatsStore.js`, `providers/statsProvider.js`, `providers/hintProvider.js` |
| 6 — UI + Bootstrap | `index.html`, `css/*`, `ui/*`, `main.js` |

Milestone exit per aspec §17:
- Phase 6: game-v3.html mockup behavior reproduced in the app (visual parity).

### QE Strategist (opus)

Reads aspec + fspec in parallel with Implementors. Produces `docs/tspecs/tspec-001-v1.md`
covering both tracks. No dependency on Implementors completing first.

**Interface:** aspec §16, fspec, 100% branch coverage target per CLAUDE.md.

---

## Phase 2 — Review (parallel per track)

Once each Implementor signals done, spawn a Reviewer (sonnet) for that track immediately
— do not wait for the other track.

- **Reviewer A** — validates Puzzle Brain code against aspec §§4–12.
- **Reviewer B** — validates App Brain code against aspec §§13–14 + fspec + vspec.

If either Reviewer returns blockers, loop back to the corresponding Implementor. The other
track proceeds independently.

---

## Phase 3 — QE Test Writer

After QE Strategist delivers the tspec and both Reviewers have signed off (or concurrently
with Reviewer sign-off if the tspec is ready first), spawn one QE Test Writer (sonnet).

The QE Test Writer implements tests from the tspec. May be split into two agents (mirroring
puzzle/app track split) if the tspec is large — judge at that time.

---

## Phase 4 — Integration + Merge

After both Reviewers sign off, run aspec Phase 7:

1. Wire `main.js` — connects Puzzle Brain providers to App Brain game/UI layer.
2. Run integration tests: `worker.test.js`, `game-flows.test.js`, `persistence.test.js`,
   `a11y.test.js`. These are the primary seam validators.
3. Performance validation: <1 s all non-generation actions; Death March cold-start <5 s.
4. Implementor produces `README.md` and deployment docs.

---

## Phase 5 — QE Test Runner loop (automated)

Automated loop, no user involvement per iteration:
- Run full test suite + c8 coverage.
- On failure: coordinate with Implementor (code bugs) or QE Test Writer (test bugs).
- Loop until all exit criteria met.

**Exit criteria** (from CLAUDE.md):
1. All tests pass
2. 100% branch coverage
3. Both Reviewers signed off (no open blockers)
4. Functional correctness validated (puzzle generation, rule enforcement)
5. All user-facing actions <1 s
6. A11y requirements met
7. User has approved UX at the current milestone boundary

---

## Interface Contracts (coordination boundary between tracks)

Both Implementors must honor these exactly. Defined in aspec §4.16 and §4.18.

### `PuzzleProvider` (aspec §4.16)
```js
requestPuzzle({ difficulty, signal }) → Promise<Puzzle>
peekReady(difficulty) → Puzzle | null
primeNext(difficulty) → void
```

### `Puzzle` shape
```js
{ id: string, difficulty: Tier, givens: Uint8Array(81), solution: Uint8Array(81), solveTrace: Step[] }
```

### `SolverHintProvider` (aspec §4.18)
```js
nextHint(puzzle, playerState, { targetCell? }) → { cellIndex, digit, technique } | null
```

---

## Agent Reference

| Role | Type | Model |
|---|---|---|
| Implementor | general-purpose | sonnet |
| Reviewer | general-purpose | sonnet |
| QE Strategist | Plan | opus |
| QE Test Writer | general-purpose | sonnet |
| QE Test Runner | general-purpose | sonnet |

Role instructions: `docs/agents/[role].md`

---

## Key Risks

- **Stub fidelity:** App Brain stubs must match Puzzle Brain output exactly. Mitigated by the
  precise interface spec in aspec §4.16/§4.18.
- **Death March tail on low-end devices:** Documented in aspec §19.4; no action required.
- **Technique correctness:** Clean-room implementation from SudokuWiki prose. Mitigated by
  the curated fixture requirement (aspec §8.3) and the 50-puzzle regression set milestone.
