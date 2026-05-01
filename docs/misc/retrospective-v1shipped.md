# Retrospective — v1 Shipped

**Date:** 2026-04-30
**Subject:** What worked, what didn't, what to keep
**Span:** 2026-04-18 (initial setup) → 2026-04-30 (v1 sign-off) — 12 days, 17 commits

---

## What shipped

A working Sudoku web application, deployed to hosting.com, accessible
in the browser. Concrete numbers:

| Surface | Lines |
|---|---|
| Production JS | 4,862 |
| Test JS | 10,309 |
| CSS | 1,093 |
| Specs (rspec/fspec/vspec/aspec/tspec) | 3,708 |
| Agent role definitions | 529 |

The app supports five difficulty tiers (Kiddie → Death March), pen +
pencil input, real-time conflict detection, tier-specific validation
behavior, hints with per-tier limits, win detection, statistics,
five visual themes, persistence across reload, full a11y (keyboard +
ARIA + screen reader announcements), and responsive layout from
desktop to ≤375 px.

Test suite: **421 passing, 0 failing, 12 pending.** Branch coverage
90.84%, all user-facing actions under perf budget, SYS3 gates the
death-march cold-start at <5 s.

---

## What worked

### 1. The multi-agent process held up end to end

Every stage produced an artifact, every artifact fed the next stage,
and the audit trail is intact. From requirements through QE, the
`docs/{rspecs,fspecs,vspecs,aspecs,tspecs,agents,misc}/` tree captures
exactly what was decided, by whom, and why. The Reviewer's puzzle-brain
and app-brain sign-offs are durable. The QE Test Runner's bug triage
(`phase4-fixes.md`) is durable. The v1 sign-off artifacts
(`CodeCoverageV1.md`, `PerformanceV1.md`, `UXReviewV1.md`) are
durable. A future maintainer can pick up the trail at any stage.

### 2. Specs that constrained the right things

The aspec didn't dictate code; it dictated module boundaries, state
shape, action types, and the Worker protocol. The fspec didn't
dictate visual design; it dictated behavior per tier. The vspec
didn't dictate behavior; it dictated themes and breakpoints. Each
spec stayed in its lane, which kept the Implementor and Visual
Designer from reading work outside their scope. Where boundaries
needed to be re-negotiated (e.g., the puzzle-generation spike
discovering that the original difficulty rating model was too naive),
the project produced an honest follow-up doc rather than papering
over the issue.

### 3. Pragmatic gates at sign-off

The iteration exit criteria in CLAUDE.md included "100% branch
coverage." We measured 90.84%, classified the gaps (worker-only paths,
boot wiring, reducer gaps), and made a deliberate decision to ship
without closing the last 9.16 points. The Product Director's framing
— "100% may be past the point of diminishing returns" — was the right
call. The same pragmatism applied to the dev-server-only narrow-window
clipping bug: it didn't reproduce in production, so we didn't fix it.
Spec-as-aspirational-target rather than spec-as-blocking-gate is what
made the milestone close on schedule.

### 4. Test-as-perf-gate landed

Adding `js/tests/integration/perf.test.js` with `[PERF]` console
relay turned the v1 perf check from a one-off measurement into a
durable regression gate. Future changes that blow past the 1-second
budget will fail the build, not just look slower. SYS3 plus PERF-NEW-*
together cover both cold-start (death-march) and warm-cache (every
tier) paths.

---

## What was hard

### 1. Token cost of the multi-agent architecture

Documented separately in `retrospective1.md` from 2026-04-21. The
short version: every subagent spawned cold and re-read CLAUDE.md, its
role file, and all upstream specs before doing any work. Cumulative
re-read cost compounded fast. This was the structural cost of the
clean separation of concerns; the value of audit trail and parallelism
was real, but not free.

### 2. Spec-to-code traceability across agent boundaries

When the Implementor was working from the aspec, it had to cross-reference
the fspec for behavioral detail. When the QE Test Writer was working
from the tspec, it had to load the aspec to understand the module
boundaries the tests needed to respect. The "Architect should write
behaviorally self-contained aspecs" mitigation from `retrospective1.md`
is the right answer — and it didn't get retrofitted to v1.

### 3. The QE Test Runner role didn't match its definition

CLAUDE.md describes the QE Test Runner as running automated bug
resolution loops. In practice it produced a triage doc
(`phase4-fixes.md`) and stopped. The fixes were applied in two
in-session iterations driven by the orchestrator. The role definition
and reality diverged. Decision was to leave the description alone for
now and re-evaluate after seeing the pattern again.

### 4. The c8/run.js plumbing was broken silently

`run.js` writes coverage with HTTP URLs but `c8 report` expects
`file://` URLs in `coverage/tmp/`. Documented in `next-session.md` as
"`npm test` then `npx c8 report`" — except that command produces a 0%
report. This stayed broken through Phase 4 because nobody ran the
documented coverage flow until v1 sign-off prep. The tspec §3.12
also calls for `run.js` to fail nonzero below 100% coverage, which it
doesn't enforce. Two related bugs in the test infrastructure that
should have been caught earlier.

### 5. Visual mockups were expensive

Four full HTML mockups at ~1,900 lines each (covered in
`retrospective1.md`). Worth it for the user-feedback iteration loop
on visual design, but a meaningful multiplier on token cost. Future
projects could iterate on a single mockup file in place, or use diffs
from a shared base.

---

## What was bigger / harder than estimated

- **The solver.** 12+ techniques (X-Wing through forcing chains and
  coloring) is real algorithmic work. The puzzle-generation spike
  alone was 313 lines of notes before any code. The follow-up doc
  acknowledged the original difficulty model was too naive and
  needed a rater that actually used the solver. Underestimated at
  spec time; resolved by writing the spike before locking the aspec.
- **The test fixtures.** Crafting valid Sudoku boards that exercise
  a specific technique without accidentally being solvable by simpler
  techniques is finicky. `xyWing.test.js` is 526 lines, `coloring.test.js`
  is 743 lines. The "100% branch coverage" target drove this — every
  path through every technique needed a fixture.
- **a11y across themes and modes.** The screen reader live region,
  double-rAF announcements, focus management around dialogs, keyboard
  parity for every action, and theme-specific contrast all needed
  explicit attention. The a11y suite passes, but it took deliberate
  test writing to get there.

---

## What was smaller / easier than estimated

- **Persistence.** The `cookie + localStorage` split with version
  tags ended up being almost incidental. Saved/restored cleanly,
  no migration drama, no edge-case bugs.
- **Theming.** Five themes via additive class on `<body>` worked
  better than expected. The vspec's "additive theme extensibility"
  constraint paid off — adding a new theme touches CSS only.
- **The reducer.** Despite carrying most of the app's logic, `state.js`
  came together quickly because the action types and state shape were
  pinned down in the aspec before code was written. The 73.84% branch
  coverage on it now is the gap, but the architecture was correct.

---

## Decisions worth remembering

- **CHANGE_DIFFICULTY does not auto-load a new puzzle.** This was a
  deliberate UX choice in the fspec — changing the selector relabels
  the current puzzle's difficulty and updates hint counts; the user
  must click "New Puzzle" explicitly to regenerate. Confirmed at v1
  sign-off; surprising on first read but correct per spec.
- **Worker code coverage is delivered via direct-import unit tests,
  not via Playwright's `page.coverage`.** Documented in tspec §4.2.
  This is why `js/worker/protocol.js` shows 100% in the coverage
  report despite running inside a Worker — it's imported directly
  by tests in the main frame.
- **Generator runs in a Worker, but the rater runs in both contexts.**
  The pre-prime cache means most user-facing "New Puzzle" clicks
  never hit cold generation. SYS3 covers the cold-start case
  explicitly.
- **The `WORKER_URL` had to resolve relative to the module, not the
  page** (commit `34dfe73`). This is the lesson saved as
  `feedback_module_relative_urls.md` in memory: prefer
  `new URL(path, import.meta.url)` over absolute `/`-rooted paths
  for runtime asset resolution. Bit us once at deployment time.

---

## Lessons for v1.x and beyond

1. **Front-load the spike work that exposes spec gaps.** The
   puzzle-generation spike found that the original rating model was
   wrong before the aspec locked in. Without it, the rater would have
   shipped broken. Run spikes for any non-trivial algorithmic
   subsystem before the architecture spec hardens.
2. **Write aspecs to be behaviorally self-contained** (carrying
   forward from `retrospective1.md`). Cross-referencing the fspec by
   section forces every Implementor read to load both documents.
3. **Decompose specs by feature rather than monolith** (also from
   `retrospective1.md`). A 1,179-line aspec read by 6+ agents is the
   load multiplier on token cost.
4. **Treat "100%" gates in the spec as aspirational targets.** The
   feedback memory `feedback_coverage_pragmatism.md` captures this:
   present the data, surface the diminishing-returns curve, let the
   Product Director decide. Don't auto-block on a number.
5. **Validate the documented test-suite-to-tooling pipeline before
   sign-off, not at sign-off.** The `run.js` → `c8 report` URL-format
   mismatch shouldn't have made it to v1 sign-off as a "discovered
   during reporting" issue. Add a smoke test for the documented
   coverage flow earlier.
6. **The Reviewer's two-pass model (puzzle brain, app brain) was
   high-leverage.** Two narrow, focused review passes caught
   different classes of issue than a single broad pass would have.
   Worth keeping for v1.x.
7. **Memory captures persistent preferences; specs capture project
   structure.** The two are complementary. Memory updates this
   session (coverage pragmatism, module-relative URLs, git push
   confirmation) will save real time on v1.x kickoff.

---

## What to do for v1.x

The backlog is captured in `docs/misc/next-session.md`:
1. Fix the `run.js` → `c8 report` plumbing and enforce the coverage
   gate per tspec §3.12.
2. Close the `js/game/state.js` branch coverage gap (73.84% → as
   close to 100% as the reducer allows).
3. Classify the rest of the per-file coverage gaps using the
   ignore/test/re-route framework in `CodeCoverageV1.md` §5.
4. Add cold-start perf parity tests for kiddie/easy/medium/hard to
   match SYS3's coverage of death-march.
5. Sanity-check Hard-puzzle generation on slow hardware (560 ms with
   1.8× headroom is the only perf number worth watching).
6. Investigate the local-dev-only narrow-window grid clipping if it
   ever surfaces in production.

None are blockers. v1 is shipped.
