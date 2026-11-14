# Handoff Brief: Developer Mode + Puzzle Sharing (V4)

**Date:** 2026-11-13
**From:** Orchestrator, with Product Director decisions
**To:** Uber Developer session (autonomous)

---

## 1. Mission

Build, review, and fully test two V4 features in this working directory:

1. `docs/rspecs/rspec-005-dev-mode.md` — Developer Mode
2. `docs/rspecs/rspec-006-puzzle-sharing.md` — Puzzle Sharing via URL

Work as the Uber Developer: follow `docs/agents/uberdeveloper.md` stage by stage, with
the overrides in §3 below. Read `CLAUDE.md` and `docs/aspecs/aspec-overview.md` first
(never `aspec-001-v1.md`).

## 2. Sequencing

Treat these as one effort with two specs. Build Developer Mode first. Its
load-from-string tool forces the shared puzzle-loading path into existence, and sharing
then reuses it. Write per-feature fspec/aspec/tspec documents
(`fspec-005-dev-mode`, `fspec-006-puzzle-sharing`, and so on). One combined review and one
combined test run at the end is fine.

**Architectural guidance (not binding, but justify a departure):** there should be exactly
one loader, from givens to `Puzzle`. It validates the input and checks for a unique solution
(`countSolutions` in `js/solver/uniqueness.js`), then rates the puzzle (the rater in
`js/generator/rater.js`). Next it builds the `Puzzle` (`toPuzzle` in
`js/generator/pipeline.js`) and dispatches `PUZZLE_LOADED`. Run validation and rating in
the worker, since rating can be expensive. Load-from-string and incoming links both call
this loader. "Unrated" needs a representation in `Puzzle.difficulty` and must flow through
persistence, stats gating, and coach/hint disabling. Find every place that assumes the
difficulty is one of the tiers.

## 3. Overrides to the Uber Developer process

- **Mockup gate waived for both features.** Skip the Stage 2 user checkpoint. Still write a
  vspec documenting the visual decisions you made, consistent with the existing themes and
  `vspec-001`/`vspec-004`. Make sure the new UI renders correctly in every theme and in
  left-hand mode.
- **No git commits, no pushes, no deploys.** Leave all work uncommitted in the working
  tree. Staging is fine. The Product Director will review the diff and decide on committing.
- **Escalate sparingly.** The Product Director wants this to run independently. Resolve
  interpretation questions yourself and record each one in the decisions log (§6). Stop
  and ask only for a genuine new product decision, a server-side proposal, or a test
  failure still unresolved after three fix iterations.

## 4. Product decisions already made

| Topic | Decision |
|---|---|
| Dev mode activation | `?dev=1` on, `?dev=0` off, persisted in localStorage |
| Share URL format | Plain 81 digits, `0` for empty; tier is never encoded and always re-rated by the recipient |
| Solver can't rate the puzzle | Load as **Unrated**, with coach and hints disabled |
| Statistics | Count only when the puzzle is rated **and** dev mode is off; Unrated never counts |
| Replacing an in-progress game | Confirm first |
| Mockups | Waived for both |
| Test standard | 100% branch coverage, dev-mode code included |
| Force technique | Out of scope (deferred) |

The Orchestrator settled these interpretations in the rspecs; follow them:

- Invalid, contradictory, or multi-solution input is rejected, not loaded.
- The confirmation is required only when there is progress on an unwon board.
- The `?p=`-style parameter is stripped via `history.replaceState` once handled.
- `.` is accepted for empty cells on input.
- The Share action must be reachable at all viewport widths.

You choose the parameter name.

## 5. Known hazards

- **Hidden header controls break tests.** Header controls such as `#hand-toggle` are
  `display:none` at viewports ≤720px. Integration tests run in small iframes; a 1px iframe
  previously made `querySelector('button')` focus a hidden control and broke a test (see the
  left-hand work: `docs/misc/bugs-left-hand-1.md`, `aspec-left-hand.md`). Any new header or
  dev control can trigger the same failure. Select controls by id or role, never "first
  button". Remember that the Share action must stay visible on narrow viewports, unlike the
  hand toggle.
- **Handedness lives on `<html data-hand>`, and the theme lives on `data-theme`.** The theme
  head script overwrites `body.className`, so don't hang new state on body classes.
- **Integration-test readiness.** `waitForPuzzle` must wait for `state.puzzle !== null`,
  not just a cell count (see `docs/misc/flaky-test-remediation.md`). A shared-link load is
  an additional asynchronous `PUZZLE_LOADED`, which can race the boot-time generated
  puzzle. Define which one wins (the shared one should) and test that explicitly.
- **Coach keys off `step.eliminations`, not headline digits** (UR Type 2/4). This matters
  for the step inspector and the CoachStep viewer.
- **Performance on unrateable input.** Rating a puzzle the solver can't finish may run the
  whole technique ladder, including forcing chains. Measure it. If the 1-second target
  (rspec-006 R12) can't be met for Unrated puzzles, document the measurement and the
  mitigation you chose. Keep the UI responsive and show a progress state.
- **Generation diagnostics** (rspec-005 R9) need attempt and rejection counts from
  `generateForTier`. Keep the protocol change additive, and keep generation deterministic
  for a given seed. Don't let the new code change which puzzle a seed produces.
- **Dev code ships to production.** There is no build step and the project root is
  uploaded as-is. Lazy-load the dev module so that it costs nothing when dev mode is off.

## 6. Deliverables

- Specs: `docs/fspecs/`, `docs/vspecs/`, `docs/aspecs/`, `docs/tspecs/` for both features.
  Update the feature spec index in `aspec-overview.md` and the directory tree if new files
  are added.
- Code and tests in the working tree, uncommitted.
- `README.md` updated: dev mode usage and share links.
- Review report: `docs/misc/review-devmode-sharing-v[n].md`, ending in a clean sign-off.
- Coverage and test summary: `docs/misc/coverage-devmode-sharing.md`,
  `docs/misc/test-summary-devmode-sharing.md`.
- **Final report:** `docs/misc/v4-devmode-sharing-report.md`, containing:
  - a decisions log (every interpretation you made, with reasoning)
  - deviations from this brief
  - performance measurements
  - known limitations
  - a suggested commit breakdown for the Product Director's review
- Mark both items as implemented-pending-review in `docs/misc/v4featureCandidates.md`.

## 7. Done when

All of the Uber Developer "Overall Done When" criteria are met, except Stage 2 user
approval (waived) and committing (withheld). Specifically:

- the full suite passes, run at least 3 consecutive times to rule out flakiness
- branch coverage is 100%
- the review sign-off is clean
- the performance target is met or documented per §5
- a11y requirements are met
- the final report is written

The Product Director's UX review follows afterward.
