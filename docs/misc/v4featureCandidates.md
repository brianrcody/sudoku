# V4 Feature Candidates

---

## Tier 1 — Top Priorities

### Left-Hand Layout Mode — ✅ Done (2026-09-13)

> Shipped in `f81f343` and deployed. Specs: `rspec-004-left-hand`, `fspec-004-left-hand`,
> `vspec-004-left-hand`, `aspec-left-hand`. Implemented as a "Left-handed" header switch;
> hidden on narrow viewports, where the layout already stacks.

Move the control panel (number pad, mode toggles, action buttons) to the left of the
board. Persistent preference. The board stays centered within the panel arrangement.

### Puzzle Sharing via URL — ✅ Done (2026-11-14)

> Shipped in `6c4803e`; inspector stepping and side panel in `415ff16`. Specs: `rspec-006-puzzle-sharing`,
> `fspec-006-puzzle-sharing`, `vspec-006-puzzle-sharing`, `aspec-puzzle-sharing`,
> `tspec-puzzle-sharing`. Report: `docs/misc/v4-devmode-sharing-report.md`. The Share
> button sits in the action row provisionally, until the hamburger menu absorbs it.

Encode the puzzle's given cells into a URL parameter. A "Share" action generates and
copies the link to clipboard. Recipients start from the same givens with no progress.
Zero server infrastructure required.

### Hamburger Menu UI Consolidation

A hamburger menu (top-right in right-hand mode, top-left in left-hand mode) consolidates
settings and actions that currently live ad-hoc in the UI: theme selection, handedness
toggle, and puzzle sharing.

---

## Tier 2 — Strong Candidates

### Daily Puzzle

A deterministic daily puzzle seeded from the date — same puzzle for all players on a
given day. Difficulty ramps across the week: Kiddie on Monday, scaling up to Nightmare on
Sunday. No server needed; the seed is computed client-side from the date.

### Developer Features — ✅ Done (2026-11-14)

> Shipped in `6c4803e`; inspector stepping and side panel in `415ff16`. Specs: `rspec-005-dev-mode`, `fspec-005-dev-mode`,
> `vspec-005-dev-mode`, `aspec-dev-mode`, `tspec-dev-mode`. Report:
> `docs/misc/v4-devmode-sharing-report.md`. All tools below are built except **Force
> technique**, which was deferred (it changes solver ordering and needs a soundness sweep).

A suite of in-app diagnostic tools, gated behind a dev mode toggle (not visible to regular
users).

**Solver step inspector** — run the solver against the current board and display each
technique it identifies, in order, with relevant cells highlighted. The canonical tool for
debugging coach output and verifying technique detection.

**Load puzzle from string** — a text input accepting an 81-character puzzle string that
initializes the board directly, bypassing the generator. Lets us reproduce bug reports and
test specific puzzles from external sources or the soundness sweep.

**Candidate overlay** — show the true computed candidate set for every cell alongside (or
instead of) the user's pencil marks. Makes solver/user state divergence immediately
visible.

**Coach step raw data viewer** — expose the `CoachStep` JSON being passed to the coach
renderer. Separates data bugs from rendering bugs without needing to instrument the code.

**Generation diagnostics** — show attempt count, rejection reasons, and the technique
profile of the generated puzzle. Useful for tuning retry limits on harder tiers and
confirming difficulty ratings.

**Force technique** — instruct the solver to skip lower-ranked techniques and surface a
specific one next. Lets us test coach rendering for a technique without constructing a
board that naturally reaches it.

---

## Tier 3 — Later

### Death March (Curated Puzzle Set)

Bring back "Death March" as a hand-curated set of puzzles that are beyond the solver's
capabilities — puzzles requiring techniques the solver cannot execute (forcing nets, pattern
overlay, etc.). Since these cannot be coached, they are presented as a pure challenge with
no hint support. Keeps the name meaningful as a true ceiling, distinct from the generated
tiers.

### Favorites and History

Let players star puzzles and revisit completed ones. Stored locally. Pairs naturally with
sharing — a shared puzzle could also be saved to favorites.

### Timer and Personal Bests

Per-difficulty solve time tracking with a personal leaderboard. Adds replay motivation
without requiring a server or accounts.

---

## Tier 4 — Backlog / Low Priority

### Pencil Mark Assist Modes

Optional auto-fill of candidates on cell selection, and/or auto-removal of pencil marks
when a digit is placed. Quality-of-life for players who find manual bookkeeping tedious.

### Coach on Demand / Nudge Mode

A lightweight "nudge" hint that surfaces a single next step without opening the full
coach. For players who want occasional help without full hand-holding.

### Mistake Highlighting Toggle

Some players want errors flagged immediately; others prefer to discover them. Make this
a player preference rather than a fixed behavior.

### Accessibility: Colorblind and High-Contrast Modes

Explicit support for common colorblindness types (deuteranopia in particular conflicts
with red/green error highlighting). Separate from general theme selection.

---

## Post-V4 Engineering — Point Release Candidate

### Code Coverage to 100% Branch

V4 shipped with project-wide coverage accepted below the 100% branch exit criterion
(decision 2026-11-27). Measured at `35c25e5` plus the working-tree defect fixes: 2757
passing, 0 failing, 10 pending; 98.32% statements, 97.01% branch. Every file in `js/dev/`
is at 100% branch. All remaining gaps predate the debug-instrumentation feature.

The bulk of the shortfall is in two files:

| File | Branch | Stmts |
|---|---|---|
| `js/ui/coachOverlay.js` | 78.78% | 71.38% |
| `js/coach/analyzer.js` | 87.2% | 92.22% |

Smaller gaps: `ui/numpad.js` 76.31%, `ui/themes.js` 83.33%, `ui/stats.js` 85.71%,
`ui/coach.js` 88.42%, `ui/srLive.js` 88.88%, `generator/fillGrid.js` 88.23%,
`generator/rater.js` 80%, `ui/grid.js` 90.62%, `ui/winBanner.js` 90.9%,
`ui/keyboard.js` 91.8%, `ui/dialog.js` 92.85%, `providers/hintProvider.js` 94.73%,
`ui/controls.js` 94.87%, `main.js` 95%, and single-branch gaps in `state.js`,
`pipeline.js`, `clientGenProvider.js`, `uniqueness.js`, `coloring.js`, `xyWing.js`,
`events.js`.

Scope for the point release: close each gap with a test, or record it as unreachable and
remove the dead branch where that is safe (e.g. `pipeline.js:172`'s `?? tier`). Some
`main.js` guards need integration tests; see `coverage-debug-instrumentation.md` Phase 1B.
Reproduce the measurement with `CodeCoverageV2.md` §6.
