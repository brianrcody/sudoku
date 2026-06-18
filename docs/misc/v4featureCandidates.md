# V4 Feature Candidates

---

## Tier 1 — Top Priorities

### Left-Hand Layout Mode

Move the control panel (number pad, mode toggles, action buttons) to the left of the
board. Persistent preference. The board stays centered within the panel arrangement.

### Puzzle Sharing via URL

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

### Developer Features

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
