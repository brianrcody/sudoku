# Fixture Strategy Options — Rank-Clean Analyzer Tests

**Context (2026-05-09):** Phase 8b tests have 12 persistent failures, all in
`js/tests/unit/coach/analyzer.test.js`. Each is the "happy path" test for ranks 4–15
in `js/tests/fixtures/puzzles/coach/index.js`. The analyzer is correct; the fixture
boards are not "rank-clean" — a lower-rank technique fires before the intended target.

The Implementor attempted a full rewrite of the fixture boards and could not produce
rank-clean boards for any of ranks 4–15 within a single session.

---

## Option A — Another Implementor round (targeted)

Brief the Implementor more precisely: fix one or two ranks at a time, verify each board
by running `analyze()` against it before committing to the fixture. Focus on finding boards
where the target technique is genuinely the minimum needed, rather than constructing boards
from scratch.

**Concrete approach:**
- For each rank, load a real Sudoku puzzle from a known puzzle database and verify (by
  running the analyzer) that the target technique fires first.
- Alternatively, use the existing technique unit test boards (e.g., `xWing.js`, `nakedSubsets.js`)
  and add more give-ins to suppress lower-rank techniques, verifying programmatically.

**Pros:** Clean fix — tests actually validate the technique ladder as designed.  
**Cons:** May take multiple sessions; the problem is hard and the first attempt failed.

---

## Option B — Accept current state, proceed to Reviewer

Treat the 12 fixture failures as known gaps (not analyzer bugs) and proceed:
1. Document the failures as "fixture construction debt" in `docs/misc/`.
2. Engage the Reviewer to sign off Phase 8b against the functional and architectural specs.
3. Commit Phase 8b with an explicit note that rank fixture coverage is incomplete.
4. Address fixture construction in a follow-on task.

**Pros:** Unblocks Phase 8b completion and UX review. Analyzer is demonstrably correct
(the failing tests are fixture bugs, not code bugs).  
**Cons:** Leaves 12 known test failures on `main`. 100% branch coverage goal is not met.
Reviewer may flag this as a blocker.

---

## Option C — Relax the test assertions

Change the happy-path tests so they don't assert a specific technique name — instead,
assert structural properties of whatever technique fires:

- The result is not `no-technique`.
- The result has the right `type` (`placement` or `elimination`).
- The schema is complete (no undefined fields).
- `autoReveal.required` matches the rank.

The conflict-handling and pencil-mark tests already pass and would remain unchanged.
The per-technique extra assertions (arrow styles, role counts, etc.) would be dropped
for ranks 4–15 or moved to separate, clearly-labeled "technique-specific" tests that
can be skipped when rank-clean fixtures aren't available.

**Pros:** Immediately eliminates all 12 failures without changing the analyzer. Tests
still cover schema completeness and cross-cutting behavior. Fast to implement.  
**Cons:** Gives up on testing the technique-ladder order, which is the core contract
of `analyze()`. A regression in the rank ordering would not be caught.

---

## Option D — Hybrid: skip happy-path, keep structural tests

Mark the 12 failing happy-path `it()` tests as `it.skip()` with a comment explaining
why (rank-clean fixture construction is deferred), but keep all other sub-tests per rank
(conflict-handling and pencil-mark independence). Add a single integration-level test
that verifies the rank ordering on a known full puzzle where the answer is independently
verifiable.

**Pros:** Honest about the gap without cluttering the failure list. Keeps structural
coverage. Deferred work is clearly labeled.  
**Cons:** Still doesn't validate the rank ladder directly. Requires a known full puzzle.

---

## Recommendation

**Option C or D** for the near term to unblock Phase 8b. Option A as follow-on work if
the rank-ordering contract matters enough to invest another session. Option B is
acceptable if the Reviewer decides the fixture gap is not a blocker for sign-off.

The key question to answer offline: **Is the rank-ordering test worth the construction
cost?** If the analyzer's rank ordering is a correctness invariant (i.e., a user
relying on it for pedagogy would notice if rank 6 fired when rank 3 should have), then
Option A is worth the investment. If it's more of a "nice to have" that the manual QA
and UX review would catch, Options C or D are pragmatic.
