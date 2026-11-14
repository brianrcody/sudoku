# Requirements Spec: Developer Mode
**ID:** rspec-005-dev-mode
**Status:** Approved (Product Director decisions captured 2026-11-13)
**Date:** 2026-11-13
**Author:** Orchestrator (from Product Director direction)
**Source:** `docs/misc/v4featureCandidates.md` — Tier 2, "Developer Features"
**Companion:** `rspec-006-puzzle-sharing.md` (shares the puzzle-loading path, R5)

---

## 1. Overview

A set of in-app diagnostic tools for debugging the solver, coach, and generator, hidden
from regular players. The audience is the developer and future agents; polish is
secondary to clarity and correctness.

## 2. Requirements

### Activation

**R1.** Loading the app with `?dev=1` turns developer mode on; `?dev=0` turns it off. The
setting persists across page loads (localStorage) until explicitly turned off. With no
`dev` parameter, the persisted setting applies; the default is off.

**R2.** When developer mode is off, no developer UI is visible or reachable by keyboard or
assistive technology, and the developer tooling code is not loaded (lazy-loaded module).

**R3.** When developer mode is on, a persistent, unobtrusive indicator shows that it is
active.

**R4.** While developer mode is on, no puzzle — generated, shared, or loaded from a
string — records statistics (attempts or wins).

### Tools

**R5. Load puzzle from string.** A text input accepts an 81-character puzzle string
(digits `1`–`9`; `0` or `.` for empty cells; surrounding and embedded whitespace
ignored) and loads it as the current puzzle, bypassing the generator. Loading follows the
same validation, rating, "Unrated" handling, and replace-confirmation rules as an incoming
shared link (`rspec-006` R4–R8). Malformed input produces a clear inline error and leaves
the current game untouched.

**R6. Solver step inspector.** Runs the logical solver against the current board (givens
plus the player's placed digits; pencil marks ignored) and lists every step it finds, in
order, through to completion or until it stalls. Each entry names the technique and its
placements/eliminations. Selecting an entry highlights the cells involved on the grid.
The inspector is read-only: it never changes the board. If the solver stalls, the list
says so explicitly.

**R7. Candidate overlay.** A toggle that shows, for every empty cell, the candidate set
computed from the current board (basic row/column/box elimination), in place of the
player's pencil marks. Where the player's pencil marks diverge from the computed set,
the divergence is visible: computed candidates the player lacks and player marks not in
the computed set are each distinguishable from agreeing candidates. Turning the overlay
off restores the normal pencil-mark display; the player's marks are never modified.

**R8. Coach step raw data viewer.** While a coach session is active, shows the
`CoachStep` object being passed to the coach renderer as formatted JSON, updating as the
session advances, with a control to copy it to the clipboard. With no active session it
says so.

**R9. Generation diagnostics.** For the current puzzle, if it was generated, shows:
requested tier, achieved tier, whether the budget-exhaustion fallback was used, attempt
count, a breakdown of rejected attempts by reason (unsolvable by the solver vs. wrong
tier), and the technique profile of the solve trace (each technique and how many times
it was used). For puzzles not produced by the generator, it says so.

### Cross-cutting

**R10.** All developer tools are keyboard operable and correctly exposed to assistive
technology (the project's a11y bar applies to dev UI too).

**R11.** Developer tooling does not degrade normal play: with dev mode off, performance
and behavior are unchanged; with it on, all user-facing actions still complete in under
1 second.

**R12.** Developer mode code is held to the project's test standard (100% branch
coverage).

## 3. Out of Scope

- **Force technique** (skipping lower-ranked techniques). Deferred: it changes solver
  ordering and would require a soundness-sweep pass.
- Any server-side logging or remote diagnostics.
- Editing or stepping the board from the inspector.
