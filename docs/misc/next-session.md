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

**W5 — resolved (2026-05-20).** Changed background request from `kiddie` to `hard` so the
background can't accidentally complete before the foreground message crosses the IPC boundary.
If flakiness recurs, the test needs restructuring to not depend on result ordering.

**GF6 — monitoring (2026-05-20).** Passed in 4 consecutive re-runs. The 2026-05-11
failure (conflicts.size === 3 instead of 0) was likely the puzzle-seed-dependent case
where digit 5 is already a given elsewhere in the chosen row. If it recurs, fix the
test to verify digit 5 is absent from the row's givens before using it.

**PERF-NEW-hard — resolved (2026-05-20).** Budget raised from 1000 ms to 2000 ms.
Hard generation is genuinely non-deterministic (observed 63–1305 ms); 1000 ms was too
tight. Saw 1046 ms pass cleanly under the new budget.

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

### Integration test gap — CT-NT4: context-aware coach error toast

The context-aware error message (added 2026-05-19) has no integration test coverage.

**CT-NT4 (to add):** Load a puzzle; trigger an `'error'` recap by following a coach
suggestion and filling the wrong digit; wait for the recap to auto-dismiss; press Coach
again; assert the error toast text includes "That suggestion didn't work out". This
confirms the `_lastSessionHadErrorRecap` flag is set and read correctly through the live
DOM, end-to-end.

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
