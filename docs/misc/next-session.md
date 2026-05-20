# Next Session — Post-v1 Backlog

v1 is **signed off** as of 2026-04-30. All iteration exit criteria
addressed. Sign-off artifacts in `docs/misc/`:
- `CodeCoverageV1.md`
- `PerformanceV1.md`
- `UXReviewV1.md`

---

## Backlog

### Rank fixtures (incremental, ongoing into V3)

The 37 pending tests are coach analyzer rank fixtures awaiting rank-clean board
collection. Progress is necessarily incremental — add fixtures opportunistically as
suitable boards are encountered. See `docs/misc/coach-fixture-tracker.md`.

### Persistent test failures (3 open)

Identified 2026-05-11 after Phase 8b coach work. None are coach-related.

**W5 — flaky test** (`js/tests/integration/worker.test.js`).
Posts a background and foreground kiddie request back-to-back and asserts foreground
resolves first. Both finish in milliseconds; ordering is a scheduling property that
can't be proven reliably with identically-fast requests. Fix: use a slow background
tier (e.g. hard/death-march) so the foreground genuinely wins by a margin.

**GF6 — investigate: product bug or test isolation** (`js/tests/integration/game-flows.test.js`).
Enters digit 5 in two cells in the same row, then erases one; expects 0 conflicts.
Gets `conflicts.size === 3`. Could be: (a) a 3-way conflict because the loaded puzzle
has digit 5 as a given elsewhere in the same unit, so erasing A still leaves B + given
in conflict, or (b) ERASE didn't clear A from pen. Determine which before fixing.

**PERF-NEW-hard — environment/budget issue** (`js/tests/integration/perf.test.js`).
Hard puzzle generation took 1289 ms against a 1000 ms budget. Death-march on the same
run was 471 ms, so the machine isn't slow overall — hard generation is just
non-deterministic and this budget has tight headroom. Fix: raise the hard budget to
2000 ms, or run 3 samples and assert on the median.

### Integration test gap — CT-NT3: coach 'error' toast

The no-technique integration tests (CT-NT1, CT-NT2) cover the `'complete'` path only.
The `'error'` path (non-conflicting wrong digit detected before solver runs) is covered
by unit tests but has no integration test counterpart.

**CT-NT3 (to add):** Load a puzzle, pen a wrong non-conflicting digit into an empty cell
(digit differs from `solution[i]` and does not appear in any given peer of that cell),
press Coach, assert the recap element is visible with `.error` class and text includes
"board has an error". The toast mechanism is already validated by CT-NT1; the primary
value of CT-NT3 is confirming the end-to-end wiring of the new `reason === 'error'`
branch through the live DOM.

### Coverage gate plumbing

The documented `npm test` → `npx c8 report` flow doesn't work because
`run.js` writes coverage with HTTP URLs but `c8` expects `file://` URLs
in `coverage/tmp/`. Also, tspec §3.12 says `run.js` should fail nonzero
below 100% coverage but doesn't. See `CodeCoverageV1.md` §7.1 for the
URL-rewrite shim.

### `js/game/state.js` branch coverage

At 73.84% branch coverage, this is the highest-priority real gap
(as opposed to defensible boot/guard branches in `main.js`). The
reducer's correctness depends on every conditional arm being covered.
See `CodeCoverageV1.md` §7.2.

### Other coverage gaps

Per-file gap list in `CodeCoverageV1.md` §2. The gap classification
framework in §5 separates "needs test" from "candidate for `c8 ignore`"
from "worker-only path needing direct-import test."

### Cold-start perf parity tests

`SYS3` gates death-march cold-start at <5 s. There's no equivalent
gate for kiddie/easy/medium/hard cold-starts (PERF-NEW-* measures
warm-cache, which is what users typically experience). Low-effort
addition if useful. See `PerformanceV1.md` §4.1.

### Hard puzzle generation on slow hardware

Hard puzzle warm-cache time was 560 ms — closest call on the perf
budget (1.8× headroom vs. >4× for everything else). Worth a sanity
check on a 5+ year old laptop or throttled mobile CPU. See
`PerformanceV1.md` §4.2.

### Narrow-window grid clipping (local-dev only)

Below ~220 px viewport width, the bottom of the grid clips on
`localhost:3001` but not on production. CSS is identical between
environments so the divergence is a server-delivery quirk. Investigate
only if it surfaces in production. Proposed fix is a one-liner
(`line-height: 1` on `.cell` in `css/grid.css`).
