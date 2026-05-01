# Next Session — Post-v1 Backlog

v1 is **signed off** as of 2026-04-30. All iteration exit criteria
addressed. Sign-off artifacts in `docs/misc/`:
- `CodeCoverageV1.md`
- `PerformanceV1.md`
- `UXReviewV1.md`

## Open backlog items (not v1 blockers)

These are documented in the v1 sign-off artifacts but were explicitly
not pursued as v1 work. Pick up if/when v1.x kicks off.

### 1. Coverage gate plumbing

The documented `npm test` → `npx c8 report` flow doesn't work because
`run.js` writes coverage with HTTP URLs but `c8` expects `file://` URLs
in `coverage/tmp/`. Also, tspec §3.12 says `run.js` should fail nonzero
below 100% coverage but doesn't. See `CodeCoverageV1.md` §7.1 for the
URL-rewrite shim.

### 2. `js/game/state.js` branch coverage

At 73.84% branch coverage, this is the highest-priority real gap
(as opposed to defensible boot/guard branches in `main.js`). The
reducer's correctness depends on every conditional arm being covered.
See `CodeCoverageV1.md` §7.2.

### 3. Other coverage gaps

Per-file gap list in `CodeCoverageV1.md` §2. The gap classification
framework in §5 separates "needs test" from "candidate for `c8 ignore`"
from "worker-only path needing direct-import test."

### 4. Cold-start perf parity tests

`SYS3` gates death-march cold-start at <5 s. There's no equivalent
gate for kiddie/easy/medium/hard cold-starts (PERF-NEW-* measures
warm-cache, which is what users typically experience). Low-effort
addition if useful. See `PerformanceV1.md` §4.1.

### 5. Hard puzzle generation on slow hardware

Hard puzzle warm-cache time was 560 ms — closest call on the perf
budget (1.8× headroom vs. >4× for everything else). Worth a sanity
check on a 5+ year old laptop or throttled mobile CPU. See
`PerformanceV1.md` §4.2.

### 6. Narrow-window grid clipping (local-dev only)

Below ~220 px viewport width, the bottom of the grid clips on
`localhost:3001` but not on production. CSS is identical between
environments so the divergence is a server-delivery quirk. Investigate
only if it surfaces in production. Proposed fix is a one-liner
(`line-height: 1` on `.cell` in `css/grid.css`).
