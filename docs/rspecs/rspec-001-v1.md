# Requirements Spec — Sudoku v1
**Status:** Complete  
**Date:** 2026-04-18  
**Author:** Orchestrator

---

## 1. Overview

A web-based Sudoku game deployable to shared web hosting. Players can generate and play
puzzles at five difficulty levels, track their statistics across sessions, and resume
in-progress games after leaving the page. The implementation uses vanilla JavaScript and
CSS. Server-side processing is permitted for puzzle generation if the Architect determines
it produces a meaningfully better result.

---

## 2. Puzzle

### 2.1 Grid
Standard 9×9 Sudoku grid. All generated puzzles must be mathematically valid: no rule
violations in the givens, and exactly one solution.

### 2.2 Generation
Puzzles are generated on the fly so that players have an unlimited supply. The Architect
is asked to evaluate and propose implementation options (client-side generation,
server-side generation, hybrid), including the tradeoffs in complexity, correctness
guarantees, and difficulty calibration. The user will select the approach from those
options.

### 2.3 Difficulty Levels

Difficulty is defined primarily by the **logical solving techniques required** to solve
the puzzle without guessing — not by clue count alone. Two puzzles with the same number
of givens can differ enormously in difficulty depending on which techniques are needed.
Clue count is a secondary factor that reinforces the difficulty tier.

The Architect must ensure that the puzzle generation approach can produce puzzles that
are rated by solving technique complexity. This requires either generating puzzles and
rating them by simulating a logical solver, or generating to target a specific technique
tier directly. Random clue removal without technique-based rating is not acceptable.

The following resources are recommended starting points for the Architect's research:

- **Peter Norvig's "Solving Every Sudoku Puzzle"** — canonical essay on constraint
  propagation and backtracking search; foundational for understanding the solver that
  underlies both generation and difficulty rating.
- **Donald Knuth's Dancing Links (DLX)** — an efficient exact cover algorithm widely
  used in high-quality Sudoku generators and solvers.
- **SudokuWiki.org** (Andrew Stuart) — the best public taxonomy of solving techniques
  organized by complexity; use as the reference for mapping techniques to our five
  difficulty tiers. Includes an interactive solver that rates puzzles by technique.
- **Hodoku** — open-source Sudoku trainer/generator that implements technique-based
  difficulty rating; source code is a useful reference for building a logical solver
  that stops when it hits a technique above the target tier.

| Level       | Required Solving Techniques                        | Givens  | Hints | Correctness Checking |
|-------------|-----------------------------------------------------|---------|-------|----------------------|
| Kiddie      | Naked singles only                                  | Most    | ∞     | Always on (real-time) |
| Easy        | Naked singles + hidden singles                      | Many    | 3     | On-demand ("Check" button) |
| Medium      | Above + naked/hidden pairs and triples              | Moderate| 1     | On-demand ("Check" button) |
| Hard        | Above + X-Wing, Swordfish, and similar patterns     | Few     | 0     | On full completion: wrong cells highlighted + message |
| Death March | Above + forcing chains, coloring, advanced patterns | Fewest  | 0     | On full completion: message only, no cell highlighting |

Exact given counts per level are left to the Architect to calibrate and document in the
aspec. Technique definitions and the rating algorithm are also Architect responsibilities.

---

## 3. Input Model

### 3.1 Custom Number Pad
All cell input is driven by a custom on-screen number pad — always visible, always part
of the fixed page layout. The system keyboard must never be invoked during play. This
is a strong product requirement: the puzzle must never be obscured by a keyboard, and
the layout must never shift during play.

The pad contains:
- Digits 1–9
- Erase button (clears the selected cell)
- Pen/Pencil mode toggle (see §4)
- Hint button (see §6)

### 3.2 Desktop Keyboard
On desktop, players may also use:
- **1–9** to enter digits in the selected cell
- **Arrow keys** to navigate between cells
- **Backspace / Delete** to erase the selected cell
- A keyboard shortcut to toggle pen/pencil mode (Functional Designer to specify)

### 3.3 Cell Selection
A cell must be selected before input is applied. Tapping or clicking a cell selects it.
Arrow key navigation on desktop moves selection between cells.

---

## 4. Pen and Pencil Marks

### 4.1 Modes
The pad operates in one of two modes, toggled by the pen/pencil button:

- **Pen mode (default):** Digits are committed answers.
- **Pencil mode:** Digits are candidates — small marks that may appear multiple times
  in a cell.

The toggle button must clearly indicate the active mode.

### 4.2 Behavior
- A cell may hold either a committed pen digit or one or more pencil candidates, not both.
- When a pen digit is entered in a cell, all pencil marks in that cell are cleared.
- Pencil marks are not subject to conflict detection or correctness checking.
- Hints fill a cell with a pen digit; pencil marks in that cell are cleared.

### 4.3 Auto-clear of Related Pencil Marks
When a pen digit is committed to a cell, whether by the player or by a hint, whether to
also auto-clear that digit's pencil marks from related cells (same row, column, and box)
is left for the Functional Designer to propose and the user to decide.

---

## 5. Validation

### 5.1 Conflict Detection
Always on for all difficulty levels. Applies to pen marks only. When two identical
committed digits appear in the same row, column, or box, both are flagged visually.
Conflict detection is purely structural — it does not require knowing the solution.

### 5.2 Correctness Checking
Applies to pen marks only. Behavior varies by difficulty:

- **Kiddie:** Incorrect cells are flagged in real time as the player enters digits.
- **Easy / Medium:** A "Check" button is available. When tapped, incorrect cells are
  flagged. The Functional Designer will specify whether highlighting persists until
  corrected or clears after a brief interval.
- **Hard:** No correctness checking is available until the puzzle is completely filled.
  At that point, the game evaluates the solution automatically. If incorrect, wrong cells
  are highlighted and a message tells the player the puzzle is not yet solved. The player
  corrects entries and tries again; no stat changes occur on an incorrect submission.
  The Functional Designer will specify whether highlighting persists or clears after a
  brief interval.
- **Death March:** Same as Hard, except no cell highlighting is shown on an incorrect
  submission — only a message telling the player the puzzle is not yet solved. The player
  receives no indication of which cells are wrong.

### 5.3 Completion
A puzzle is complete when all 81 cells contain a committed pen digit and the solution is
correct. Completion triggers the win state (§8).

---

## 6. Hints

### 6.1 Mechanics
Hints are cell-targeted: the player selects an empty cell, then taps the Hint button to
fill it with the correct digit. Selecting a non-empty cell and tapping Hint has no effect
(or the button is disabled in that state — Functional Designer to specify).

### 6.2 Remaining Count
The number of remaining hints is displayed on or immediately adjacent to the Hint button
at all times. For Kiddie (unlimited), display "∞".

### 6.3 Exhaustion
When hints are exhausted, the Hint button is disabled for the remainder of the puzzle.

### 6.4 Hint Allowances
See §2.3. Kiddie: unlimited. Easy: 3. Medium: 1. Hard: 0. Death March: 0.

---

## 7. Controls

| Control             | Behavior                                                                 |
|---------------------|--------------------------------------------------------------------------|
| New Puzzle          | Generates a new puzzle at the current difficulty level                   |
| Reset               | Clears all player entries; restores the original givens and hint count   |
| Difficulty selector | Changes the active difficulty level                                      |
| Check               | (Easy and Medium only) Triggers on-demand correctness check              |
| Hint                | Fills the selected empty cell with the correct digit; consumes one hint  |
| Pen/Pencil toggle   | Switches input mode between committed digits and candidates               |
| Erase               | Clears the selected cell (pen digit or all pencil marks)                 |

### 7.1 Mid-Puzzle Abandonment Warning
If the player taps **New Puzzle** or changes the difficulty level while a puzzle is in
progress, they receive a warning that doing so will abandon the current puzzle. They must
confirm before proceeding.

---

## 8. Win State

When a puzzle is completed correctly (§5.3):
- A completion animation plays. The Visual Designer will propose options.
- The games-won statistic increments.
- The puzzle is no longer resumable.

---

## 9. Statistics

### 9.1 Tracked Values
Statistics are tracked independently per difficulty level (Kiddie, Easy, Medium, Hard,
Death March):

- **Games attempted:** increments the first time the player enters a pen digit or uses a
  hint in a new puzzle at that difficulty. Resuming a saved in-progress puzzle does not
  increment this counter again.
- **Games won:** increments on correct puzzle completion at that difficulty.

### 9.2 Display
Statistics are always visible on the page. Exact placement is left to the Visual Designer.

### 9.3 Storage
Statistics are stored in a cookie. They persist across sessions and browser restarts.

---

## 10. Visual Themes

The game supports multiple visual styles that the player can select. The active theme is
stored in a cookie and restored on subsequent visits.

### 10.1 Suggested Themes
The following themes are starting points. The Visual Designer is invited to propose
additional options or refine these:

- **Minimalist** — clean, neutral, typography-forward
- **Coffee Shop** — warm tones, soft textures, relaxed feel
- **School** — lined paper, pencil marks aesthetic, nostalgic
- **Digital Terminal** — monospace font, dark background, phosphor-green or amber palette

### 10.2 Theme Selection UI
Exact placement and interaction design (dropdown, icon picker, etc.) is left to the
Visual Designer. The selector must be accessible via keyboard.

### 10.3 Theme Storage
The selected theme is stored in a cookie independently of puzzle state and statistics.

---

## 11. Persistence

### 11.1 Saved State
On every cell entry (pen digit, pencil mark, or erase), the following are written to a
cookie:
- The current puzzle (givens)
- All committed pen marks
- All pencil marks
- Remaining hint count
- Whether games-attempted has been incremented for this puzzle

### 11.2 Resume Behavior
When the player returns to the page, the saved puzzle is restored exactly. Resuming does
not affect statistics.

### 11.3 Invalidation
Saved puzzle state is cleared on New Puzzle, on confirmed difficulty change, and on
puzzle completion.

---

## 12. Responsive Design and Accessibility

### 12.1 Supported Surfaces
The game must be fully playable on desktop browsers, tablets, and mobile phones. Layout
and interaction must adapt appropriately to each surface.

### 12.2 Accessibility
- Fully keyboard navigable (desktop)
- Correct ARIA roles and labels throughout
- Screen reader compatible

### 12.3 Performance
All user-facing actions must complete in under 1 second. Puzzle generation is the one
area where this threshold may need to be relaxed depending on the Architect's chosen
approach; the Architect should flag this explicitly if the proposed approach cannot meet
the 1-second target, and the user will decide whether to accept a longer generation time
or require a different approach.

---

## 13. Technical Constraints

- Vanilla JavaScript and CSS — no frameworks
- No build step required
- Deployable as static files to shared web hosting
- PHP 8.2 available server-side if the Architect's puzzle generation proposal requires it
- No timer in v1
- No auto-fill candidates in v1

---

## 14. Open Items for Downstream Agents

| Item                                           | Owner                        |
|------------------------------------------------|------------------------------|
| Puzzle generation approach (options + perf tradeoff) | Architect → user decision    |
| Exact given counts per difficulty level              | Architect                    |
| Auto-clear related pencil marks on commit            | Functional Designer → user   |
| Check button: persistent vs. brief highlight         | Functional Designer → user   |
| Completion animation options                         | Visual Designer → user       |
| Hint button state when non-empty cell selected       | Functional Designer          |
| Pen/pencil keyboard shortcut                         | Functional Designer          |
| Layout and visual design                             | Visual Designer              |
| Visual theme proposals (beyond the four seeds)       | Visual Designer → user       |
| Theme selector UI placement and interaction          | Visual Designer              |
